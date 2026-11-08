// @vitest-environment node
import 'dotenv/config';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
import { hachearClave } from '@/lib/auth/hash';
import { firmarSesion } from '@/lib/auth/sesion';
import { liberarVencidas } from '@/lib/domain/liberar';
import { MOTIVO_LIBERADA_POR_VENCIMIENTO } from '@/lib/domain/turnos';
import { GET as listar, POST as crear } from '../solicitudes/route';
import { POST as procesar } from '../sync/procesar/route';

function req(ruta: string, cuerpo?: unknown, cookie?: string, method = 'POST'): NextRequest {
  return new NextRequest(`http://prueba${ruta}`, {
    method,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}

describe.sequential('solicitudes vivo (B-02)', () => {
  let sedeId = 0;
  let canchaId = 0;
  let cookie = '';
  let usuarioId = 0;
  const fecha = '2027-01-15';

  beforeAll(async () => {
    const sede = await bd.sede.create({
      // Cierre 23:59 = medianoche: permite ejercitar el bloque 23:00–00:00.
      data: { nombre: `Sol_${Date.now()}`, apertura: '00:00', cierre: '23:59' },
    });
    sedeId = sede.id;
    const cancha = await bd.cancha.create({
      data: { sedeId, nombre: 'Cancha 1', tarifaBaseCentavos: 7000, estado: 'DISPONIBLE', motivoNoDisponible: null },
    });
    canchaId = cancha.id;
    const usuario = await bd.usuario.create({
      data: {
        email: `solfull_${Date.now()}@prueba.local`,
        passwordHash: await hachearClave('Sol_Vivo_99'),
        nombre: 'Sol',
        rol: 'USUARIO',
      },
    });
    usuarioId = usuario.id;
    cookie = `access_token=${await firmarSesion(usuario.id)}`;
  });

  afterAll(async () => {
    await bd.solicitud.deleteMany({ where: { canchaId } });
    await bd.operacionPendiente.deleteMany({ where: { usuarioId } });
    await bd.registroCambio.deleteMany({ where: { tabla: 'Solicitud' } });
    await bd.cancha.deleteMany({ where: { sedeId } });
    await bd.usuario.delete({ where: { id: usuarioId } });
    await bd.sede.delete({ where: { id: sedeId } });
    await bd.$disconnect();
  });

  it('sin sesión → 401', async () => {
    const r = await crear(req('/api/solicitudes', { canchaId, fecha, horaInicio: '10:00' }));
    expect(r.status).toBe(401);
  });

  it('crea con hold de 3 h y aparece en el listado propio', async () => {
    const r = await crear(req('/api/solicitudes', { canchaId, fecha, horaInicio: '10:00' }, cookie));
    expect(r.status).toBe(201);
    const s = (await r.json()) as {
      id: number;
      estado: string;
      intento: number;
      montoTotalCentavos: number;
      limiteHold: string;
      usuarioId: number;
    };
    expect(s).toMatchObject({ estado: 'PENDIENTE', intento: 1, montoTotalCentavos: 7000, usuarioId });
    const minutos = (new Date(s.limiteHold).getTime() - Date.now()) / 60_000;
    expect(minutos).toBeGreaterThan(178);
    expect(minutos).toBeLessThanOrEqual(180.5);
    const l = await listar(req('/api/solicitudes', undefined, cookie, 'GET'));
    const lista = (await l.json()) as { solicitudes: Array<{ id: number }> };
    expect(lista.solicitudes.map((x) => x.id)).toContain(s.id);
  });

  it('slot ocupado → 409 conflicto (sin doble booking)', async () => {
    const r = await crear(req('/api/solicitudes', { canchaId, fecha, horaInicio: '10:00' }, cookie));
    expect(r.status).toBe(409);
    const n = await bd.solicitud.count({ where: { canchaId, fecha, horaInicio: '10:00', estado: 'PENDIENTE' } });
    expect(n).toBe(1);
  });

  it('rechazada del mismo slot → intento 2; y liberar vencidas', async () => {
    const pendiente = await bd.solicitud.findFirst({
      where: { canchaId, fecha, horaInicio: '10:00', estado: 'PENDIENTE' },
      orderBy: { intento: 'desc' },
    });
    await bd.solicitud.update({ where: { id: pendiente!.id }, data: { estado: 'RECHAZADA', motivo: 'pago' } });
    const r = await crear(req('/api/solicitudes', { canchaId, fecha, horaInicio: '10:00' }, cookie));
    expect(r.status).toBe(201);
    const intento2 = (await r.json()) as { intento: number; id: number };
    expect(intento2.intento).toBe(2);
    // Plazo de 3 h vencido → LIBERADA por el reloj servidor (solo la pendiente activa).
    await bd.solicitud.update({
      where: { id: intento2.id },
      data: { limiteHold: new Date(Date.now() - 60_000) },
    });
    const liberadas = await liberarVencidas();
    expect(liberadas).toBeGreaterThanOrEqual(1);
    // El motivo interno (registro de la empresa) explica el exceso de tiempo.
    expect(await bd.solicitud.findUnique({ where: { id: intento2.id } })).toMatchObject({
      estado: 'LIBERADA',
      motivo: MOTIVO_LIBERADA_POR_VENCIMIENTO,
    });
    // El turno vuelve a estar libre: se puede volver a solicitar.
    const reintento = await crear(req('/api/solicitudes', { canchaId, fecha, horaInicio: '10:00' }, cookie));
    expect(reintento.status).toBe(201);
  });

  it('solo hora en punto: fracciones se rechazan con 400', async () => {
    // F-01 vive como unitario en turnos.test.ts (solapanConFecha); por API los
    // turnos son en punto, así que el cruce 23:30/00:00 ya no puede crearse.
    await bd.solicitud.deleteMany({ where: { canchaId } });
    const a = await crear(req('/api/solicitudes', { canchaId, fecha: '2027-02-10', horaInicio: '23:30' }, cookie));
    expect(a.status).toBe(400);
    const b = await crear(req('/api/solicitudes', { canchaId, fecha: '2027-02-10', horaInicio: '23:00' }, cookie));
    expect(b.status).toBe(201);
    await bd.solicitud.deleteMany({ where: { canchaId } });
  });

  it('procesador offline: op aceptada crea solicitud; ocupado → conflicto', async () => {
    await bd.solicitud.deleteMany({ where: { canchaId } });
    const opId = 'eeeeeeee-1111-4111-8111-eeeeeeeeeeee';
    await bd.operacionPendiente.create({
      data: { usuarioId, clienteOpId: opId, tipo: 'solicitud.crear', carga: { canchaId, fecha, horaInicio: '11:00' }, cargaHash: 'h1' },
    });
    const r1 = await procesar(req('/api/sync/procesar', {}, cookie));
    expect(r1.status).toBe(200);
    const a1 = (await r1.json()) as { resultados: Array<{ estado: string }> };
    expect(a1.resultados[0].estado).toBe('aceptada');
    expect(await bd.operacionPendiente.findUnique({ where: { usuarioId_clienteOpId: { usuarioId, clienteOpId: opId } } })).toMatchObject({ estado: 'procesada' });
    // Segunda op mismo slot → conflicto visible.
    const opId2 = 'eeeeeeee-2222-4222-8222-eeeeeeeeeeee';
    await bd.operacionPendiente.create({
      data: { usuarioId, clienteOpId: opId2, tipo: 'solicitud.crear', carga: { canchaId, fecha, horaInicio: '11:00' }, cargaHash: 'h2' },
    });
    const r2 = await procesar(req('/api/sync/procesar', {}, cookie));
    const a2 = (await r2.json()) as { resultados: Array<{ estado: string }> };
    expect(a2.resultados[0].estado).toBe('conflicto');
    expect(await bd.operacionPendiente.findUnique({ where: { usuarioId_clienteOpId: { usuarioId, clienteOpId: opId2 } } })).toMatchObject({ estado: 'conflicto' });
  });
});
