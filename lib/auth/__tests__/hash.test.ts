import { describe, expect, it } from 'vitest';
import { hachearClave, verificarClave } from '../hash';

describe('hash de claves (A-03/AC-01)', () => {
  it('hachea con bcrypt coste 12 y verifica', async () => {
    const hash = await hachearClave('Secreta_123');
    expect(hash).toMatch(/^\$2[aby]\$12\$/);
    expect(await verificarClave('Secreta_123', hash)).toBe(true);
    expect(await verificarClave('otra', hash)).toBe(false);
  });
});
