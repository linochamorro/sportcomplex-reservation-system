// @vitest-environment node
import 'dotenv/config';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
import { tomarLote, TIPOS_IMPLEMENTADOS_REF } from './helpers-cola';

// Cola priorizada (B-03/AC-04): ops de tipos no implementados no deben
// acaparar el lote por delante de una implementada más nueva.
describe.sequential('cola priorizada por tipo', () => {
  let usuarioId = 0;
  const ids: string[] = [];

  beforeAll(async () => {
    const u = await bd.usuario.create({
      data: { email: `cola_${Date.now()}@prueba.local`, passwordHash: 'h', nombre: 'Q', rol: 'USUARIO' },
    });
    usuarioId = u.id;
  });

  afterAll(async () => {
    await bd.operacionPendiente.deleteMany({ where: { usuarioId } });
    await bd.usuario.delete({ where: { id: usuarioId } });
    await bd.$disconnect();
  });

  it('60 ops no implementadas antiguas no bloquean una solicitud.crear nueva', async () => {
    const antiguas = [];
    for (let i = 0; i < 60; i += 1) {
      const opId = `f0000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      ids.push(opId);
      antiguas.push({
        usuarioId,
        clienteOpId: opId,
        tipo: 'tipo.no.implementado',
        carga: {},
        cargaHash: `h${i}`,
      });
    }
    await bd.operacionPendiente.createMany({ data: antiguas });
    await bd.$executeRaw`UPDATE "OperacionPendiente" SET "creadoEn" = now() - interval '1 hour' WHERE "usuarioId" = ${usuarioId}`;
    const nueva = 'f0000000-9999-4999-8999-999999999999';
    ids.push(nueva);
    await bd.operacionPendiente.create({
      data: { usuarioId, clienteOpId: nueva, tipo: 'solicitud.crear', carga: {}, cargaHash: 'hn' },
    });
    const lote = await tomarLote(bd, 10, usuarioId, TIPOS_IMPLEMENTADOS_REF);
    expect(lote.map((o) => o.clienteOpId)).toContain(nueva);
    expect(lote.every((o) => o.tipo === 'solicitud.crear')).toBe(true);
  });
});
