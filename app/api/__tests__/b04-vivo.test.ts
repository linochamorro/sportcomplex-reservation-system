// @vitest-environment node
import 'dotenv/config';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
import { hachearClave } from '@/lib/auth/hash';
import { firmarSesion } from '@/lib/auth/sesion';
import { obtenerAlmacenamiento } from '@/lib/domain/almacenamiento';
import { POST as subirComprobante } from '../solicitudes/[id]/comprobante/route';
import { POST as firmar } from '../comprobantes/firmar/route';
import { POST as reembolsar } from '../bloqueos/[id]/reembolsar/route';
import { POST as procesar } from '../sync/procesar/route';

function req(ruta: string, cuerpo: unknown, cookie?: string, method = 'POST'): NextRequest {
  return new NextRequest(`http://prueba${ruta}`, {
    method,
    body: JSON.stringify(cuerpo),
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });

const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64');

describe.sequential('comprobantes vivo (B-04)', () => {
  let sedeId = 0;
  let canchaId = 0;
  let usuarioId = 0;
  let adminId = 0;
  let cookieUser = '';
  let cookieAdmin = '';

  beforeAll(async () => {
    const hash = await hachearClave('B04_Vivo_99');
    sedeId = (await bd.sede.create({ data: { nombre: `B04_${Date.now()}`, apertura: '08:00', cierre: '23:00' } })).id;
    canchaId = (
      await bd.cancha.create({
        data: { sedeId, nombre: 'C1', tarifaBaseCentavos: 5000, estado: 'DISPONIBLE', motivoNoDisponible: null },
      })
    ).id;
    usuarioId = (await bd.usuario.create({ data: { email: `b04u_${Date.now()}@prueba.local`, passwordHash: hash, nombre: 'U', rol: 'USUARIO' } })).id;
    adminId = (await bd.usuario.create({ data: { email: `b04a_${Date.now()}@prueba.local`, passwordHash: hash, nombre: 'A', rol: 'ADMIN', sedeId } })).id;
    cookieUser = `access_token=${await firmarSesion(usuarioId)}`;
    cookieAdmin = `access_token=${await firmarSesion(adminId)}`;
  });

  afterAll(async () => {
    await bd.comprobante.deleteMany({ where: { solicitud: { canchaId } } });
    await bd.accionReservaAfectada.deleteMany({ where: { solicitud: { canchaId } } });
    await bd.solicitud.deleteMany({ where: { canchaId } });
    await bd.bloqueoCancha.deleteMany({ where: { canchaId } });
    await bd.operacionPendiente.deleteMany({ where: { usuarioId: { in: [usuarioId, adminId] } } });
    await bd.registroCambio.deleteMany({ where: { tabla: { in: ['Comprobante', 'Solicitud'] } } });
    await bd.cancha.deleteMany({ where: { sedeId } });
    await bd.usuario.deleteMany({ where: { id: { in: [usuarioId, adminId] } } });
    await bd.sede.delete({ where: { id: sedeId } });
    await bd.$disconnect();
  });

  let seq = 0;
  async function crearSolicitud(estado: 'PENDIENTE' | 'CONFIRMADA' = 'PENDIENTE'): Promise<number> {
    seq += 1;
    const hora = String(8 + seq).padStart(2, '0');
    const s = await bd.solicitud.create({
      data: { usuarioId, canchaId, fecha: '2027-06-01', horaInicio: `${hora}:00`, horaFin: `${hora}:59`, estado, montoTotalCentavos: 5000, limiteHold: new Date(Date.now() + 20 * 60_000) },
    });
    return s.id;
  }

  it('firmar: USUARIO pago ok, reembolso 403; ADMIN reembolso ok', async () => {
    const p = await firmar(req('/api/comprobantes/firmar', { proposito: 'pago', extension: 'jpg' }, cookieUser));
    expect(p.status).toBe(200);
    expect(((await p.json()) as { ruta: string }).ruta).toMatch(/^comprobantes\/pago\//);
    expect((await firmar(req('/x', { proposito: 'reembolso', extension: 'jpg' }, cookieUser))).status).toBe(403);
    const r = await firmar(req('/x', { proposito: 'reembolso', extension: 'pdf' }, cookieAdmin));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { ruta: string }).ruta).toMatch(/^comprobantes\/reembolso\//);
  });

  it('subir comprobante de pago: inválido 400, válido crea; no dueño 404', async () => {
    const s = await crearSolicitud();
    const malo = await subirComprobante(req('/x', { bytesBase64: 'no-base64', nombreArchivo: 'a.jpg', contentType: 'image/jpeg' }, cookieUser), ctx(s));
    expect(malo.status).toBe(400);
    const ok = await subirComprobante(req('/x', { bytesBase64: JPEG, nombreArchivo: 'a.jpg', contentType: 'image/jpeg' }, cookieUser), ctx(s));
    expect(ok.status).toBe(201);
    const comp = await bd.comprobante.findUnique({ where: { solicitudId_proposito: { solicitudId: s, proposito: 'PAGO' } } });
    expect(comp).toMatchObject({ contentType: 'image/jpeg', bytes: 6 });
    // Otro usuario no puede adjuntar (404 sin filtrar).
    const otro = (await bd.usuario.create({ data: { email: `b04x_${Date.now()}@prueba.local`, passwordHash: 'h', nombre: 'X', rol: 'USUARIO' } })).id;
    const cookieOtro = `access_token=${await firmarSesion(otro)}`;
    expect((await subirComprobante(req('/x', { bytesBase64: JPEG, nombreArchivo: 'a.jpg', contentType: 'image/jpeg' }, cookieOtro), ctx(s))).status).toBe(404);
    await bd.usuario.delete({ where: { id: otro } });
  });

  it('reembolso exige comprobante y lo crea (B-03 F-01)', async () => {
    const s = await crearSolicitud('CONFIRMADA');
    const b = await bd.bloqueoCancha.create({ data: { canchaId, fecha: '2027-06-01', horaInicio: '00:00', horaFin: '23:59', motivo: 'x' } });
    const sin = await reembolsar(req('/x', { solicitudId: s }, cookieAdmin), ctx(b.id));
    expect(sin.status).toBe(400);
    const ok = await reembolsar(req('/x', { solicitudId: s, bytesBase64: JPEG, nombreArchivo: 'r.jpg', contentType: 'image/jpeg' }, cookieAdmin), ctx(b.id));
    expect(ok.status).toBe(200);
    const comp = await bd.comprobante.findUnique({ where: { solicitudId_proposito: { solicitudId: s, proposito: 'REEMBOLSO' } } });
    expect(comp?.rutaStorage).toMatch(/^comprobantes\/reembolso\//);
    const accion = await bd.accionReservaAfectada.findUnique({ where: { bloqueoId_solicitudId: { bloqueoId: b.id, solicitudId: s } } });
    expect(accion?.detalle).toMatch(/^comprobante:/);
  });

  it('op offline comprobante.subir procesa', async () => {
    const s = await crearSolicitud();
    await bd.operacionPendiente.create({
      data: { usuarioId, clienteOpId: 'cccc3333-3333-4333-8333-333333333333', tipo: 'comprobante.subir', carga: { solicitudId: s, bytesBase64: JPEG, nombreArchivo: 'a.jpg', contentType: 'image/jpeg' }, cargaHash: 'h' },
    });
    const r = await procesar(req('/api/sync/procesar', {}, cookieUser));
    expect(r.status).toBe(200);
    expect(((await r.json()) as { resultados: Array<{ estado: string }> }).resultados[0].estado).toBe('aceptada');
    expect(await bd.comprobante.findUnique({ where: { solicitudId_proposito: { solicitudId: s, proposito: 'PAGO' } } })).toBeTruthy();
  });

  it('almacenamiento local en no-producción', () => {
    expect(obtenerAlmacenamiento()).toBeInstanceOf(Object);
  });

  it('F-01: ADMIN de otra sede no puede adjuntar PAGO (403)', async () => {
    const otraSede = (await bd.sede.create({ data: { nombre: `B04X_${Date.now()}`, apertura: '08:00', cierre: '23:00' } })).id;
    const adminOtra = (await bd.usuario.create({ data: { email: `b04ao_${Date.now()}@prueba.local`, passwordHash: 'h', nombre: 'O', rol: 'ADMIN', sedeId: otraSede } })).id;
    const cookieOtra = `access_token=${await firmarSesion(adminOtra)}`;
    const s = await crearSolicitud();
    const r = await subirComprobante(req('/x', { bytesBase64: JPEG, nombreArchivo: 'a.jpg', contentType: 'image/jpeg' }, cookieOtra), ctx(s));
    expect(r.status).toBe(403);
    await bd.usuario.delete({ where: { id: adminOtra } });
    await bd.sede.delete({ where: { id: otraSede } });
  });

  it('F-03: reembolso es idempotente (segunda vez devuelve el mismo comprobante)', async () => {
    const s = await crearSolicitud('CONFIRMADA');
    const b = await bd.bloqueoCancha.create({ data: { canchaId, fecha: '2027-06-01', horaInicio: '00:00', horaFin: '23:59', motivo: 'y' } });
    const cuerpo = { solicitudId: s, bytesBase64: JPEG, nombreArchivo: 'r.jpg', contentType: 'image/jpeg' };
    const r1 = await reembolsar(req('/x', cuerpo, cookieAdmin), ctx(b.id));
    expect(r1.status).toBe(200);
    const r2 = await reembolsar(req('/x', cuerpo, cookieAdmin), ctx(b.id));
    expect(r2.status).toBe(200);
    const n = await bd.comprobante.count({ where: { solicitudId: s, proposito: 'REEMBOLSO' } });
    expect(n).toBe(1);
    expect(((await r1.json()) as { comprobanteId: number }).comprobanteId).toBe(
      ((await r2.json()) as { comprobanteId: number }).comprobanteId,
    );
  });

  it('F-10: reembolsar una no-afectada → 409', async () => {
    const s = await crearSolicitud('CONFIRMADA');
    const b = await bd.bloqueoCancha.create({ data: { canchaId, fecha: '2027-06-01', horaInicio: '00:00', horaFin: '01:00', motivo: 'z' } });
    const r = await reembolsar(req('/x', { solicitudId: s, bytesBase64: JPEG, nombreArchivo: 'r.jpg', contentType: 'image/jpeg' }, cookieAdmin), ctx(b.id));
    expect(r.status).toBe(409);
  });

  it('F-04: la carga de comprobante.subir se purga tras procesar', async () => {
    const s = await crearSolicitud();
    const opId = 'dddd4444-4444-4444-8444-444444444444';
    await bd.operacionPendiente.create({
      data: { usuarioId, clienteOpId: opId, tipo: 'comprobante.subir', carga: { solicitudId: s, bytesBase64: JPEG, nombreArchivo: 'a.jpg', contentType: 'image/jpeg' }, cargaHash: 'hp' },
    });
    const r = await procesar(req('/api/sync/procesar', {}, cookieUser));
    expect(r.status).toBe(200);
    const fila = await bd.operacionPendiente.findUnique({ where: { usuarioId_clienteOpId: { usuarioId, clienteOpId: opId } } });
    expect(fila?.estado).toBe('procesada');
    expect(fila?.carga).toEqual({});
  });
});
