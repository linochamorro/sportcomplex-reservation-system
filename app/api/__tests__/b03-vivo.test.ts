// @vitest-environment node
import 'dotenv/config';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
import { hachearClave } from '@/lib/auth/hash';
import { firmarSesion } from '@/lib/auth/sesion';
import { POST as confirmar } from '../solicitudes/[id]/confirmar/route';
import { POST as rechazar } from '../solicitudes/[id]/rechazar/route';
import { POST as noShow } from '../solicitudes/[id]/no-show/route';
import { POST as crearBloqueo } from '../bloqueos/route';
import { GET as afectadas } from '../bloqueos/[id]/afectadas/route';
import { POST as reasignar } from '../bloqueos/[id]/reasignar/route';
import { POST as reembolsar } from '../bloqueos/[id]/reembolsar/route';
import { POST as procesar } from '../sync/procesar/route';

function req(ruta: string, cuerpo?: unknown, cookie?: string, method = 'POST'): NextRequest {
  return new NextRequest(`http://prueba${ruta}`, {
    method,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
  });
}
const ctx = (id: number) => ({ params: Promise.resolve({ id: String(id) }) });
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]).toString('base64');

describe.sequential('verificacion y bloqueos vivo (B-03)', () => {
  let sedeA = 0;
  let sedeB = 0;
  let canchaA = 0;
  let usuarioId = 0;
  let adminA = '';
  let adminB = '';
  let cookieUser = '';
  let seq = 0;

  async function crearPendiente(horaInicio: string, fecha = '2027-04-10'): Promise<number> {
    seq += 1;
    const s = await bd.solicitud.create({
      data: {
        usuarioId,
        canchaId: canchaA,
        fecha,
        horaInicio,
        horaFin: '23:00',
        estado: 'PENDIENTE',
        montoTotalCentavos: 5000,
        limiteHold: new Date(Date.now() + 20 * 60_000),
      },
    });
    void seq;
    return s.id;
  }

  async function limpiar(): Promise<void> {
    await bd.comprobante.deleteMany({ where: { solicitud: { canchaId: canchaA } } });
    await bd.accionReservaAfectada.deleteMany({ where: { solicitud: { canchaId: canchaA } } });
    await bd.solicitud.deleteMany({ where: { canchaId: canchaA } });
    await bd.bloqueoCancha.deleteMany({ where: { canchaId: canchaA } });
  }

  beforeAll(async () => {
    const hash = await hachearClave('B03_Vivo_99');
    const sA = await bd.sede.create({ data: { nombre: `B03A_${Date.now()}`, apertura: '08:00', cierre: '23:00' } });
    const sB = await bd.sede.create({ data: { nombre: `B03B_${Date.now()}`, apertura: '08:00', cierre: '23:00' } });
    sedeA = sA.id;
    sedeB = sB.id;
    canchaA = (
      await bd.cancha.create({
        data: { sedeId: sedeA, nombre: 'C1', tarifaBaseCentavos: 5000, estado: 'DISPONIBLE', motivoNoDisponible: null },
      })
    ).id;
    const u = await bd.usuario.create({
      data: { email: `b03_${Date.now()}@prueba.local`, passwordHash: hash, nombre: 'U', rol: 'USUARIO' },
    });
    usuarioId = u.id;
    const aA = await bd.usuario.create({
      data: { email: `b03a_${Date.now()}@prueba.local`, passwordHash: hash, nombre: 'A', rol: 'ADMIN', sedeId: sedeA },
    });
    const aB = await bd.usuario.create({
      data: { email: `b03b_${Date.now()}@prueba.local`, passwordHash: hash, nombre: 'B', rol: 'ADMIN', sedeId: sedeB },
    });
    adminA = `access_token=${await firmarSesion(aA.id)}`;
    adminB = `access_token=${await firmarSesion(aB.id)}`;
    cookieUser = `access_token=${await firmarSesion(u.id)}`;
  });

  afterAll(async () => {
    const ids = (await bd.usuario.findMany({ where: { email: { contains: 'b03' } }, select: { id: true } })).map((x) => x.id);
    await limpiar();
    await bd.operacionPendiente.deleteMany({ where: { usuarioId: { in: ids } } });
    await bd.registroCambio.deleteMany({ where: { tabla: { in: ['Solicitud', 'BloqueoCancha', 'Comprobante'] } } });
    await bd.cancha.deleteMany({ where: { sedeId: { in: [sedeA, sedeB] } } });
    await bd.usuario.deleteMany({ where: { id: { in: ids } } });
    await bd.sede.deleteMany({ where: { id: { in: [sedeA, sedeB] } } });
    await bd.$disconnect();
  });

  it('USUARIO no puede confirmar (403); ADMIN de otra sede tampoco', async () => {
    const id = await crearPendiente('10:00');
    expect((await confirmar(req(`/x`, {}, cookieUser), ctx(id))).status).toBe(403);
    expect((await confirmar(req(`/x`, {}, adminB), ctx(id))).status).toBe(403);
  });

  it('confirmar desde PENDIENTE; rechazar exige motivo; no-show desde CONFIRMADA', async () => {
    const id1 = await crearPendiente('11:00');
    const c = await confirmar(req('/x', {}, adminA), ctx(id1));
    expect(c.status).toBe(200);
    expect(((await c.json()) as { estado: string }).estado).toBe('CONFIRMADA');
    const id2 = await crearPendiente('12:00');
    expect((await rechazar(req('/x', {}, adminA), ctx(id2))).status).toBe(400);
    const r = await rechazar(req('/x', { motivo: 'pago ilegible' }, adminA), ctx(id2));
    expect(r.status).toBe(200);
    expect(await bd.solicitud.findUnique({ where: { id: id2 } })).toMatchObject({ estado: 'RECHAZADA', motivo: 'pago ilegible' });
    const ns = await noShow(req('/x', {}, adminA), ctx(id1));
    expect(ns.status).toBe(200);
    expect(((await ns.json()) as { estado: string }).estado).toBe('NO_SHOW');
  });

  it('confirmar re-valida hold vencido y bloqueo vigente (F-03)', async () => {
    const vencida = await bd.solicitud.create({
      data: { usuarioId, canchaId: canchaA, fecha: '2027-04-11', horaInicio: '10:00', horaFin: '11:00', estado: 'PENDIENTE', montoTotalCentavos: 5000, limiteHold: new Date(Date.now() - 60_000) },
    });
    expect((await confirmar(req('/x', {}, adminA), ctx(vencida.id))).status).toBe(409);
  });

  it('bloqueo: PENDIENTE→CANCELADA, afectadas y reembolso/reasignación', async () => {
    const pend = await crearPendiente('15:00', '2027-04-12');
    const conf = await crearPendiente('16:00', '2027-04-12');
    await bd.solicitud.update({ where: { id: conf }, data: { estado: 'CONFIRMADA' } });
    const b = await crearBloqueo(
      req('/api/bloqueos', { canchaId: canchaA, fecha: '2027-04-12', horaInicio: '14:00', horaFin: '18:00', motivo: 'mantenimiento' }, adminA),
    );
    expect(b.status).toBe(201);
    const bid = ((await b.json()) as { id: number; canceladas: number }).id;
    expect(await bd.solicitud.findUnique({ where: { id: pend } })).toMatchObject({ estado: 'CANCELADA' });
    const af = await afectadas(req('/x', undefined, adminA, 'GET'), ctx(bid));
    const lista = ((await af.json()) as { afectadas: Array<{ id: number }> }).afectadas.map((x) => x.id);
    expect(lista).toContain(conf);
    const re = await reasignar(req('/x', { solicitudId: conf, fecha: '2027-04-12', horaInicio: '20:00', horaFin: '21:00' }, adminA), ctx(bid));
    expect(re.status).toBe(200);
    expect(await bd.solicitud.findUnique({ where: { id: conf } })).toMatchObject({ horaInicio: '20:00' });
    // reembolsar una confirmada distinta (B-04: exige comprobante)
    const conf2 = await crearPendiente('17:00', '2027-04-12');
    await bd.solicitud.update({ where: { id: conf2 }, data: { estado: 'CONFIRMADA' } });
    const rem = await reembolsar(
      req('/x', { solicitudId: conf2, bytesBase64: JPEG, nombreArchivo: 'r.jpg', contentType: 'image/jpeg' }, adminA),
      ctx(bid),
    );
    expect(rem.status).toBe(200);
    const accion = await bd.accionReservaAfectada.findUnique({ where: { bloqueoId_solicitudId: { bloqueoId: bid, solicitudId: conf2 } } });
    expect(accion).toMatchObject({ accion: 'REEMBOLSADA' });
  });

  it('bloqueo cross-midnight cancela la PENDIENTE del día siguiente (hallazgo 1)', async () => {
    await limpiar();
    const pend = await bd.solicitud.create({
      data: { usuarioId, canchaId: canchaA, fecha: '2027-05-11', horaInicio: '00:00', horaFin: '01:00', estado: 'PENDIENTE', montoTotalCentavos: 5000, limiteHold: new Date(Date.now() + 20 * 60_000) },
    });
    const b = await crearBloqueo(
      req('/api/bloqueos', { canchaId: canchaA, fecha: '2027-05-10', horaInicio: '23:30', horaFin: '00:30', motivo: 'cierre' }, adminA),
    );
    expect(b.status).toBe(201);
    expect(await bd.solicitud.findUnique({ where: { id: pend.id } })).toMatchObject({ estado: 'CANCELADA' });
  });

  it('confirmar rechaza si hay bloqueo que solapa (no solo igualdad)', async () => {
    await limpiar();
    const s = await bd.solicitud.create({
      data: { usuarioId, canchaId: canchaA, fecha: '2027-05-20', horaInicio: '10:00', horaFin: '11:00', estado: 'PENDIENTE', montoTotalCentavos: 5000, limiteHold: new Date(Date.now() + 20 * 60_000) },
    });
    await bd.bloqueoCancha.create({ data: { canchaId: canchaA, fecha: '2027-05-20', horaInicio: '10:30', horaFin: '12:00', motivo: 'parcial' } });
    const r = await confirmar(req('/x', {}, adminA), ctx(s.id));
    expect(r.status).toBe(409);
  });

  it('procesador offline: confirmar y op venenosa aislada', async () => {
    await limpiar();
    const s = await bd.solicitud.create({
      data: { usuarioId, canchaId: canchaA, fecha: '2027-04-20', horaInicio: '10:00', horaFin: '11:00', estado: 'PENDIENTE', montoTotalCentavos: 5000, limiteHold: new Date(Date.now() + 20 * 60_000) },
    });
    const adminAId = (await bd.usuario.findFirst({ where: { email: { contains: 'b03a' } } }))!.id;
    await bd.operacionPendiente.create({
      data: { usuarioId: adminAId, clienteOpId: 'aaaa1111-1111-4111-8111-111111111111', tipo: 'solicitud.confirmar', carga: { solicitudId: s.id }, cargaHash: 'h1' },
    });
    await bd.operacionPendiente.create({
      data: { usuarioId: adminAId, clienteOpId: 'bbbb2222-2222-4222-8222-222222222222', tipo: 'solicitud.confirmar', carga: { solicitudId: 99999999 }, cargaHash: 'h2' },
    });
    const r = await procesar(req('/api/sync/procesar', {}, adminA));
    expect(r.status).toBe(200);
    const res = ((await r.json()) as { resultados: Array<{ estado: string }> }).resultados;
    expect(res.some((x) => x.estado === 'aceptada')).toBe(true);
    expect(res.some((x) => x.estado === 'rechazada')).toBe(true);
    expect(await bd.solicitud.findUnique({ where: { id: s.id } })).toMatchObject({ estado: 'CONFIRMADA' });
  });
});
