// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  BACKOFF_MAX_MS,
  BACKOFF_TOPE_MS,
  cadenaEstable,
  hashCarga,
  msBackoff,
  TIPOS_OP_CONOCIDOS,
  UUID_V4,
} from '../tipos';

describe('contrato de protocolo v1 (B-01)', () => {
  it('backoff con topes y jitter acotado', () => {
    expect(msBackoff(0, 0)).toBe(1000);
    expect(msBackoff(0, 1)).toBe(2000);
    expect(msBackoff(30, 1)).toBe(BACKOFF_TOPE_MS);
    expect(msBackoff(1000, 1)).toBeLessThanOrEqual(BACKOFF_MAX_MS);
  });

  it('cadenaEstable determinista ante orden de claves', () => {
    expect(cadenaEstable({ b: 1, a: { d: 4, c: 3 } })).toBe(cadenaEstable({ a: { c: 3, d: 4 }, b: 1 }));
    expect(hashCarga({ a: 1 })).toBe(hashCarga({ a: 1 }));
    expect(hashCarga({ a: 1 })).not.toBe(hashCarga({ a: 2 }));
  });

  it('UUIDv4 obligatorio y tipos conocidos cerrados', () => {
    expect(UUID_V4.test('123e4567-e89b-42d3-a456-426614174000')).toBe(true);
    expect(UUID_V4.test('no-uuid')).toBe(false);
    expect(UUID_V4.test('123e4567-e89b-12d3-a456-426614174000')).toBe(false);
    expect(TIPOS_OP_CONOCIDOS).toContain('solicitud.crear');
    expect(TIPOS_OP_CONOCIDOS).not.toContain('admin.borrar_todo');
  });
});
