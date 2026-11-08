// @vitest-environment node
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { aplicarCambios, evacuarDispositivo } from '../bd-local';
import { avisosDebidos, reconciliarAlDespertar } from '../recordatorios-locales';

beforeEach(async () => {
  await evacuarDispositivo();
});

describe('worker local de recordatorios (B-05/AC-03)', () => {
  it('avisa 20/10 desde caché y persiste la revisión', async () => {
    const ahora = new Date('2027-08-01T11:45:00Z');
    await aplicarCambios([
      { seq: '1', tabla: 'Solicitud', filaId: 1, sedeId: 1, usuarioId: 1, eliminado: false, fila: { id: 1, fecha: '2027-08-01', horaInicio: '07:00', estado: 'PENDIENTE' } },
      { seq: '2', tabla: 'Solicitud', filaId: 2, sedeId: 1, usuarioId: 1, eliminado: false, fila: { id: 2, fecha: '2027-08-01', horaInicio: '06:55', estado: 'CONFIRMADA' } },
      { seq: '3', tabla: 'Solicitud', filaId: 3, sedeId: 1, usuarioId: 1, eliminado: false, fila: { id: 3, fecha: '2027-08-01', horaInicio: '06:00', estado: 'PENDIENTE' } },
    ]);
    // 07:00 Lima = 12:00Z → 15 min: aviso 20. 06:55 = 11:55Z → 10 min: aviso 10. 06:00 ya pasó.
    const avisos = await avisosDebidos(ahora);
    expect(avisos.map((a) => a.clave).sort()).toEqual(['local:1:20', 'local:2:10']);
  });

  it('reconciliar aplica el pull y recalcula (servidor gana)', async () => {
    const ahora = new Date('2027-08-01T11:45:00Z');
    const cambios = [
      { seq: '9', tabla: 'Solicitud', filaId: 5, sedeId: 1, usuarioId: 1, eliminado: false, fila: { id: 5, fecha: '2027-08-01', horaInicio: '06:55', estado: 'PENDIENTE' } },
    ];
    const avisos = await reconciliarAlDespertar(async (c) => aplicarCambios(c), cambios, ahora);
    expect(avisos.map((a) => a.clave)).toEqual(['local:5:10']);
  });

  it('sin IndexedDB no programa nada', async () => {
    const { indexedDB } = globalThis as Record<string, unknown>;
    delete (globalThis as Record<string, unknown>).indexedDB;
    try {
      expect(await avisosDebidos()).toEqual([]);
    } finally {
      (globalThis as Record<string, unknown>).indexedDB = indexedDB;
    }
  });
});
