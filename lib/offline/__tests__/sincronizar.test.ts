// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { encolarOp, evacuarDispositivo, obtenerBdLocal, type OpLocal } from '../bd-local';
import { MAX_REINTENTOS_LOCAL, sincronizar, type PuertaSync } from '../sincronizar';

const OP = (sufijo: string) => ({
  clienteOpId: `aaaaaaaa-0000-4000-8000-0000000000${sufijo}`,
  tipo: 'solicitud.crear',
  carga: { sedeId: 1 },
});

function puertaBase() {
  return {
    push: vi.fn<PuertaSync['push']>(async () => []),
    pull: vi.fn<PuertaSync['pull']>(async () => ({ cambios: [], token: '7' })),
    leerToken: vi.fn<PuertaSync['leerToken']>(async () => '0'),
    guardarToken: vi.fn<PuertaSync['guardarToken']>(async () => undefined),
    haySesion: vi.fn<PuertaSync['haySesion']>(async () => true),
  };
}

beforeEach(async () => {
  await evacuarDispositivo();
});

describe('motor sincronizar (B-01/AC-03)', () => {
  it('sin sesión no corre (abortada, outbox intacta)', async () => {
    await encolarOp(OP('01'));
    const puerta = puertaBase();
    puerta.haySesion.mockResolvedValue(false);
    const r = await sincronizar(puerta);
    expect(r.abortada).toBe(true);
    expect(puerta.push).not.toHaveBeenCalled();
    expect(puerta.pull).not.toHaveBeenCalled();
    const db = await obtenerBdLocal();
    expect(await db?.outbox.count()).toBe(1);
  });

  it('kill tras POST: sin marcas, reintento idempotente', async () => {
    await encolarOp(OP('02'));
    const puerta = puertaBase();
    puerta.push.mockRejectedValueOnce(new Error('red caída'));
    const r1 = await sincronizar(puerta);
    expect(r1.abortada).toBe(true);
    const db = await obtenerBdLocal();
    expect((await db?.outbox.get(OP('02').clienteOpId))?.estado).toBe('pendiente');
    puerta.push.mockResolvedValueOnce([{ clienteOpId: OP('02').clienteOpId, estado: 'aceptada', serverId: 3 }]);
    const r2 = await sincronizar(puerta);
    expect(r2.empujadas).toBe(1);
    expect(await db?.outbox.count()).toBe(0);
  });

  it('conflicto queda terminal y visible (prohibido cliente-gana)', async () => {
    await encolarOp(OP('03'));
    const puerta = puertaBase();
    puerta.push.mockResolvedValue([{ clienteOpId: OP('03').clienteOpId, estado: 'conflicto', motivo: 'slot ocupado' }]);
    const r = await sincronizar(puerta);
    expect(r.conflictos).toBe(1);
    const db = await obtenerBdLocal();
    expect(await db?.outbox.get(OP('03').clienteOpId)).toMatchObject({ estado: 'conflicto', intentos: 0 });
    // Segundo ciclo no lo reintenta ni lo borra.
    await sincronizar(puertaBase());
    expect(await db?.outbox.get(OP('03').clienteOpId)).toMatchObject({ estado: 'conflicto' });
  });

  it('fallida reprograma con backoff y a los 10 va a DLQ local', async () => {
    await encolarOp(OP('04'));
    const puerta = puertaBase();
    puerta.push.mockResolvedValue([{ clienteOpId: OP('04').clienteOpId, estado: 'rechazada', motivo: 'x' }]);
    await sincronizar(puerta);
    const db = await obtenerBdLocal();
    expect(await db?.outbox.get(OP('04').clienteOpId)).toMatchObject({ estado: 'pendiente', intentos: 1 });
    await db?.outbox.update(OP('04').clienteOpId, { intentos: MAX_REINTENTOS_LOCAL - 1 });
    await sincronizar(puerta);
    expect(await db?.outbox.get(OP('04').clienteOpId)).toMatchObject({ estado: 'fallida' });
  });

  it('push en orden (creadoEn, clienteOpId)', async () => {
    await encolarOp(OP('0b'));
    await encolarOp(OP('0a'));
    const db = await obtenerBdLocal();
    await db?.outbox.update(OP('0b').clienteOpId, { creadoEn: 1 });
    await db?.outbox.update(OP('0a').clienteOpId, { creadoEn: 2 });
    const puerta = puertaBase();
    puerta.push.mockResolvedValue([]);
    await sincronizar(puerta);
    expect(puerta.push.mock.calls[0]?.[0]?.map((o: OpLocal) => o.clienteOpId)).toEqual([
      OP('0b').clienteOpId,
      OP('0a').clienteOpId,
    ]);
  });

  it('sesión expirada a mitad: aborta y conserva token', async () => {
    const puerta = puertaBase();
    puerta.haySesion.mockResolvedValueOnce(true).mockResolvedValue(false);
    const r = await sincronizar(puerta);
    expect(r.abortada).toBe(true);
    expect(puerta.pull).not.toHaveBeenCalled();
    expect(puerta.guardarToken).not.toHaveBeenCalled();
  });
});
