// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { estaOfflineDisponible, obtenerBdLocal } from '../bd-local';

describe('guard SSR fail-closed (B-01/OBS-08)', () => {
  it('sin IndexedDB no hay store (null, sin throw)', async () => {
    expect('indexedDB' in globalThis).toBe(false);
    expect(estaOfflineDisponible()).toBe(false);
    expect(await obtenerBdLocal()).toBeNull();
  });
});
