// @vitest-environment node
import 'dotenv/config';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
import { GET as mantenimientoCron, POST as mantenimiento } from '../mantenimiento/route';

function req(token?: string): NextRequest {
  return new NextRequest('http://prueba/api/mantenimiento', {
    method: 'POST',
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
}

describe.sequential('mantenimiento (B-02/F-02)', () => {
  let sedeId = 0;
  let canchaId = 0;
  let usuarioId = 0;

  beforeAll(async () => {
    const previo = process.env.CRON_SECRET;
    process.env.CRON_SECRET = 'cron_secreto_de_prueba_1234567890';
    expect(previo === undefined || typeof previo === 'string').toBe(true);
    const sede = await bd.sede.create({ data: { nombre: `Mant_${Date.now()}`, apertura: '08:00', cierre: '23:00' } });
    sedeId = sede.id;
    const cancha = await bd.cancha.create({
      data: { sedeId, nombre: 'C1', tarifaBaseCentavos: 5000, estado: 'DISPONIBLE', motivoNoDisponible: null },
    });
    canchaId = cancha.id;
    const usuario = await bd.usuario.create({
      data: { email: `mant_${Date.now()}@prueba.local`, passwordHash: 'h', nombre: 'M', rol: 'USUARIO' },
    });
    usuarioId = usuario.id;
  });

  afterAll(async () => {
    await bd.solicitud.deleteMany({ where: { canchaId } });
    await bd.registroCambio.deleteMany({ where: { tabla: 'Solicitud' } });
    await bd.cancha.deleteMany({ where: { sedeId } });
    await bd.usuario.delete({ where: { id: usuarioId } });
    await bd.sede.delete({ where: { id: sedeId } });
    await bd.$disconnect();
  });

  it('sin Bearer → 401; con Bearer libera holds vencidos', async () => {
    expect((await mantenimiento(req())).status).toBe(401);
    expect((await mantenimiento(req('incorrecto'))).status).toBe(401);
    expect((await mantenimientoCron(req('incorrecto'))).status).toBe(401);
    const vencida = await bd.solicitud.create({
      data: {
        usuarioId,
        canchaId,
        fecha: '2027-03-01',
        horaInicio: '12:00',
        horaFin: '13:00',
        estado: 'PENDIENTE',
        montoTotalCentavos: 5000,
        limiteHold: new Date(Date.now() - 60_000),
      },
    });
    const r = await mantenimiento(req('cron_secreto_de_prueba_1234567890'));
    expect(r.status).toBe(200);
    const j = (await r.json()) as { liberadas: number };
    expect(j.liberadas).toBeGreaterThanOrEqual(1);
    expect(await bd.solicitud.findUnique({ where: { id: vencida.id } })).toMatchObject({ estado: 'LIBERADA' });
  });
});
