// @vitest-environment node
import 'dotenv/config';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
import { hachearClave } from '@/lib/auth/hash';
import { firmarSesion } from '@/lib/auth/sesion';
import { revisarRecordatorios } from '@/lib/domain/recordatorios';
import { GET as centro } from '../notificaciones/route';
import { POST as procesar } from '../sync/procesar/route';

function req(ruta: string, cuerpo?: unknown, cookie?: string, method = 'POST'): NextRequest {
  return new NextRequest(`http://prueba${ruta}`, {
    method,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}

describe.sequential('notificaciones vivo (B-05)', () => {
  let sedeId = 0;
  let canchaId = 0;
  let usuarioId = 0;
  let otroId = 0;
  let cookie = '';
  let cookieOtro = '';

  beforeAll(async () => {
    const hash = await hachearClave('B05_Vivo_99');
    sedeId = (await bd.sede.create({ data: { nombre: `B05_${Date.now()}`, apertura: '00:00', cierre: '23:59' } })).id;
    canchaId = (
      await bd.cancha.create({
        data: { sedeId, nombre: 'C1', tarifaBaseCentavos: 1000, estado: 'DISPONIBLE', motivoNoDisponible: null },
      })
    ).id;
    usuarioId = (await bd.usuario.create({ data: { email: `b05_${Date.now()}@prueba.local`, passwordHash: hash, nombre: 'U', rol: 'USUARIO' } })).id;
    otroId = (await bd.usuario.create({ data: { email: `b05o_${Date.now()}@prueba.local`, passwordHash: hash, nombre: 'O', rol: 'USUARIO' } })).id;
    cookie = `access_token=${await firmarSesion(usuarioId)}`;
    cookieOtro = `access_token=${await firmarSesion(otroId)}`;
  });

  afterAll(async () => {
    await bd.notificacion.deleteMany({ where: { usuarioId: { in: [usuarioId, otroId] } } });
    await bd.registroCambio.deleteMany({ where: { tabla: 'Notificacion' } });
    await bd.solicitud.deleteMany({ where: { canchaId } });
    await bd.operacionPendiente.deleteMany({ where: { usuarioId: { in: [usuarioId, otroId] } } });
    await bd.cancha.deleteMany({ where: { sedeId } });
    await bd.usuario.deleteMany({ where: { id: { in: [usuarioId, otroId] } } });
    await bd.sede.delete({ where: { id: sedeId } });
    await bd.$disconnect();
  });

  it('revisarRecordatorios es idempotente (doble pasada no duplica)', async () => {
    // Solicitud que empieza en 15 min: ventana recordatorio_20.
    const ahora = new Date();
    const inicio = new Date(ahora.getTime() + 15 * 60_000);
    // Convertir inicio UTC a fecha/hora pared Lima (UTC-5 fijo).
    const lima = new Date(inicio.getTime() - 5 * 3_600_000);
    const fecha = lima.toISOString().slice(0, 10);
    const horaInicio = `${String(lima.getUTCHours()).padStart(2, '0')}:${String(lima.getUTCMinutes()).padStart(2, '0')}`;
    const s = await bd.solicitud.create({
      data: { usuarioId, canchaId, fecha, horaInicio, horaFin: horaInicio, estado: 'PENDIENTE', montoTotalCentavos: 1000, limiteHold: new Date(ahora.getTime() + 30 * 60_000) },
    });
    const n1 = await bd.$transaction((tx) => revisarRecordatorios(tx, ahora));
    const n2 = await bd.$transaction((tx) => revisarRecordatorios(tx, ahora));
    expect(n1).toBeGreaterThanOrEqual(1);
    expect(n2).toBe(0);
    expect(await bd.notificacion.count({ where: { solicitudId: s.id } })).toBeGreaterThanOrEqual(1);
  });

  it('centro propio: solo ve las suyas', async () => {
    await bd.notificacion.create({ data: { usuarioId: otroId, tipo: 'aviso', titulo: 'ajena', cuerpo: 'x' } });
    const r = await centro(req('/api/notificaciones', undefined, cookie, 'GET'));
    expect(r.status).toBe(200);
    const lista = ((await r.json()) as { notificaciones: Array<{ titulo: string }> }).notificaciones;
    expect(lista.length).toBeGreaterThan(0);
    expect(lista.every((n) => n.titulo !== 'ajena')).toBe(true);
  });

  it('op offline notificacion.leer marca la propia; ajena se rechaza', async () => {
    const propia = await bd.notificacion.create({ data: { usuarioId, tipo: 'aviso', titulo: 'p', cuerpo: 'c' } });
    const ajena = await bd.notificacion.create({ data: { usuarioId: otroId, tipo: 'aviso', titulo: 'a', cuerpo: 'c' } });
    await bd.operacionPendiente.create({
      data: { usuarioId, clienteOpId: 'eeee5555-5555-4555-8555-555555555555', tipo: 'notificacion.leer', carga: { notificacionId: propia.id }, cargaHash: 'h1' },
    });
    await bd.operacionPendiente.create({
      data: { usuarioId, clienteOpId: 'ffff6666-6666-4666-8666-666666666666', tipo: 'notificacion.leer', carga: { notificacionId: ajena.id }, cargaHash: 'h2' },
    });
    const r = await procesar(req('/api/sync/procesar', {}, cookie));
    expect(r.status).toBe(200);
    const res = ((await r.json()) as { resultados: Array<{ estado: string }> }).resultados;
    expect(res.map((x) => x.estado).sort()).toEqual(['aceptada', 'rechazada']);
    expect(await bd.notificacion.findUnique({ where: { id: propia.id } })).toMatchObject({ leida: true });
    expect(await bd.notificacion.findUnique({ where: { id: ajena.id } })).toMatchObject({ leida: false });
  });
});
