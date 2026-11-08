// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  aplicarCambios,
  encolarOp,
  evacuarDispositivo,
  marcarAcks,
  obtenerBdLocal,
} from '../bd-local';

beforeEach(async () => {
  await evacuarDispositivo();
});

describe('outbox local durable (B-01/AC-02)', () => {
  it('encola, ordena y limpia tras ACK; conflicto queda visible', async () => {
    await encolarOp({ clienteOpId: '11111111-1111-4111-8111-111111111111', tipo: 'solicitud.crear', carga: { a: 1 } });
    await encolarOp({ clienteOpId: '22222222-2222-4222-8222-222222222222', tipo: 'solicitud.crear', carga: { a: 2 } });
    const db = await obtenerBdLocal();
    expect(await db?.outbox.count()).toBe(2);
    await marcarAcks([
      { clienteOpId: '11111111-1111-4111-8111-111111111111', estado: 'aceptada', serverId: 9 },
      { clienteOpId: '22222222-2222-4222-8222-222222222222', estado: 'conflicto', motivo: 'slot ocupado' },
    ]);
    // Aceptada se borra; conflicto queda con motivo (nunca silencioso).
    expect(await db?.outbox.count()).toBe(1);
    expect(await db?.outbox.get('22222222-2222-4222-8222-222222222222')).toMatchObject({
      estado: 'conflicto',
      error: 'slot ocupado',
    });
  });

  it('tumba del pull expulsa de caché; fila viva hace upsert', async () => {
    await aplicarCambios([
      { seq: '1', tabla: 'Cancha', filaId: 5, sedeId: 1, usuarioId: null, eliminado: false, fila: { id: 5, nombre: 'A' } },
    ]);
    const db = await obtenerBdLocal();
    expect(await db?.cache.get('Cancha:5')).toMatchObject({ filaId: 5 });
    await aplicarCambios([
      { seq: '2', tabla: 'Cancha', filaId: 5, sedeId: 1, usuarioId: null, eliminado: true, fila: null },
    ]);
    expect(await db?.cache.get('Cancha:5')).toBeUndefined();
  });

  it('logout expulsa todo rastro del dispositivo', async () => {
    await encolarOp({ clienteOpId: '33333333-3333-4333-8333-333333333333', tipo: 'solicitud.crear', carga: {} });
    await evacuarDispositivo();
    const db = await obtenerBdLocal();
    expect(await db?.outbox.count()).toBe(0);
    expect(await db?.cache.count()).toBe(0);
  });
});
