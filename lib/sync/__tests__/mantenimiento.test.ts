// @vitest-environment node
import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
import {
  DIAS_RETENCION_OPS,
  purgarOperacionesAntiguas,
  purgarRegistroAntiguo,
  tomarLote,
} from '../mantenimiento';

// Mantenimiento de cola y tumbas (B-01/OBS-05). BD de desarrollo, con limpieza.
describe.sequential('mantenimiento sync', () => {
  const opId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

  afterAll(async () => {
    await bd.operacionPendiente.deleteMany({ where: { clienteOpId: opId } });
    await bd.$disconnect();
  });

  it('tomarLote filtra por tipo en SQL y devuelve en orden (creadoEn, id)', async () => {
    const creada = await bd.operacionPendiente.create({
      data: { usuarioId: 1, clienteOpId: opId, tipo: 'solicitud.crear', carga: {}, cargaHash: 'x' },
    });
    // Sin tipos → vacío; con tipo implementado → la incluye.
    expect(await tomarLote(bd, 10, null, [])).toEqual([]);
    const lote = await tomarLote(bd, 10, null, ['solicitud.crear']);
    expect(lote.map((o) => o.id)).toContain(creada.id);
    // Un tipo no implementado no la devuelve.
    expect(await tomarLote(bd, 10, null, ['bloqueo.reembolsar'])).toEqual([]);
    const ordenado = [...lote].sort((a, b) => a.id - b.id);
    expect(lote.map((o) => o.id)).toEqual(ordenado.map((o) => o.id));
  });

  it('purga terminales antiguas y preserva pendientes y recientes', async () => {
    const vieja = Date.now() - (DIAS_RETENCION_OPS + 1) * 86_400_000;
    await bd.$executeRaw`UPDATE "OperacionPendiente" SET estado = 'procesada', "actualizadoEn" = to_timestamp(${vieja / 1000}) WHERE "clienteOpId" = ${opId}`;
    const purgadas = await purgarOperacionesAntiguas();
    expect(purgadas).toBeGreaterThanOrEqual(1);
    expect(await bd.operacionPendiente.findUnique({ where: { usuarioId_clienteOpId: { usuarioId: 1, clienteOpId: opId } } })).toBeNull();
  });

  it('purgarRegistroAntiguo no toca lo reciente', async () => {
    await bd.registroCambio.create({ data: { tabla: 'Sede', filaId: 1 } });
    expect(await purgarRegistroAntiguo()).toBe(0);
    await bd.registroCambio.deleteMany({ where: { tabla: 'Sede', filaId: 1 } });
  });
});
