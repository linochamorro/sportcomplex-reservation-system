import { describe, expect, it } from 'vitest';
import { normalizarEmail, validarClave, validarEmail } from '../../../../src/lib/auth/validacion';

describe('validación de entradas', () => {
  it('acepta correos normales', () => {
    for (const correo of [
      'usuario1@ejemplo.com',
      'usuario2@ejemplo.com',
      'usuario3@ejemplo.com',
      'usuario4@ejemplo.com',
      'usuario5@ejemplo.com',
    ]) {
      expect(validarEmail(correo)).toBe(true);
    }
  });

  it('rechaza correos con inyección o formato inválido', () => {
    for (const correo of [
      '',
      'sin-arroba',
      'sin@tld',
      'a@b',
      'espacio usuario6@ejemplo.com',
      "' OR '1'='usuario7@ejemplo.com",
      '1; DELETE FROM "Usuario"@ejemplo.com',
      '<script>alert(1)</script>@ejemplo.com',
      'salto\r\nusuario8@ejemplo.com',
      'usuario9@ejemplo.com\nBcc: usuario10@ejemplo.com',
      `largo${'a'.repeat(250)}@ejemplo.com`,
    ]) {
      expect(validarEmail(correo)).toBe(false);
    }
  });

  it('acepta el % del local-part (RFC válido) pero el contenido nunca se interpola en SQL', () => {
    // El % es legal en correos; lo que lo hace seguro es el acceso parametrizado.
    expect(validarEmail('usuario11@ejemplo.com')).toBe(true);
  });

  it('normaliza a minúsculas sin espacios', () => {
    expect(normalizarEmail('  USUARIO13@ejemplo.com ')).toBe('usuario13@ejemplo.com');
  });

  it('exige clave de 8 a 128 caracteres', () => {
    expect(validarClave('12345678')).toBe(true);
    expect(validarClave('1234567')).toBe(false);
    expect(validarClave('x'.repeat(129))).toBe(false);
    expect(validarClave(12345678 as unknown as string)).toBe(false);
  });
});
