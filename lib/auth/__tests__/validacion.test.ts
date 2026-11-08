import { describe, expect, it } from 'vitest';
import { normalizarEmail, validarClave, validarEmail } from '../validacion';

describe('validación de entradas', () => {
  it('acepta correos normales', () => {
    for (const correo of [
      'linochamorro@example.com',
      'test-super@example.com',
      'nombre.apellido@correo.pe',
      'usuario+etiqueta@sub.dominio.com',
      'nombre_con_guion@mi-empresa.com',
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
      'espacio en@correo.com',
      "' OR '1'='1@x.com",
      '1; DELETE FROM "Usuario"@x.com',
      '<script>alert(1)</script>@x.com',
      'salto\r\nde@linea.com',
      'a@b.com\nBcc: victim@x.com',
      `largo${'a'.repeat(250)}@correo.com`,
    ]) {
      expect(validarEmail(correo)).toBe(false);
    }
  });

  it('acepta el % del local-part (RFC válido) pero el contenido nunca se interpola en SQL', () => {
    // El % es legal en correos; lo que lo hace seguro es el acceso parametrizado.
    expect(validarEmail('%27%3B%20DROP@x.com')).toBe(true);
  });

  it('normaliza a minúsculas sin espacios', () => {
    expect(normalizarEmail('  Lino.O.Herrera@Example.COM ')).toBe('lino.o.herrera@example.com');
  });

  it('exige clave de 8 a 128 caracteres', () => {
    expect(validarClave('12345678')).toBe(true);
    expect(validarClave('1234567')).toBe(false);
    expect(validarClave('x'.repeat(129))).toBe(false);
    expect(validarClave(12345678 as unknown as string)).toBe(false);
  });
});
