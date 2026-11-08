import { describe, expect, it } from 'vitest';
import pg from 'pg';
import { clasificarError } from '../clasificar-error';

/** Error con forma de Prisma: solo `code` importa para clasificar. */
function prisma(code: string, mensaje = 'detalle interno'): Error & { code: string } {
  return Object.assign(new Error(mensaje), { code });
}

describe('clasificarError', () => {
  it('transitorios de Prisma → 503 DB_NO_DISPONIBLE', () => {
    for (const codigo of ['P1000', 'P1001', 'P1002', 'P1008', 'P1011', 'P1017', 'P2024', 'P2028']) {
      const r = clasificarError(prisma(codigo));
      expect(r.estado, codigo).toBe(503);
      expect(r.codigo).toBe('DB_NO_DISPONIBLE');
      expect(r.reintentable).toBe(true);
    }
  });

  it('SQLSTATE de conexión y recursos → 503', () => {
    for (const codigo of ['08000', '08006', '40001', '40P01', '53300', '57P01', '57P03']) {
      expect(clasificarError(prisma(codigo)).estado, codigo).toBe(503);
    }
  });

  it('errores de socket de Node → 503', () => {
    for (const codigo of ['ECONNREFUSED', 'ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'ENOTFOUND', 'EAI_AGAIN']) {
      expect(clasificarError(prisma(codigo)).estado, codigo).toBe(503);
    }
  });

  it('choque de datos → 409, no 500', () => {
    const r = clasificarError(prisma('P2002'));
    expect(r.estado).toBe(409);
    expect(r.codigo).toBe('CONFLICTO_UNICO');
    expect(r.reintentable).toBe(false);
    expect(clasificarError(prisma('P2003')).estado).toBe(409);
  });

  it('ausente → 404 y violación de modelo → 400', () => {
    expect(clasificarError(prisma('P2025')).estado).toBe(404);
    for (const codigo of ['P2000', 'P2011', 'P2012', 'P2014', 'P2023']) {
      expect(clasificarError(prisma(codigo)).estado, codigo).toBe(400);
    }
  });

  it('lo que no se reconoce → 500 sin reintentar', () => {
    for (const error of [new Error('boom'), prisma('P9999'), 'texto', null, undefined, 42]) {
      const r = clasificarError(error);
      expect(r.estado).toBe(500);
      expect(r.codigo).toBe('ERROR_INTERNO');
      expect(r.reintentable).toBe(false);
    }
  });

  it('respeta el invariante: reintentable si y solo si 503', () => {
    const errores = [
      prisma('P1001'),
      prisma('P2024'),
      prisma('57P01'),
      prisma('ECONNREFUSED'),
      prisma('P2002'),
      prisma('P2025'),
      prisma('P2023'),
      new Error('boom'),
    ];
    for (const error of errores) {
      const r = clasificarError(error);
      expect(r.reintentable, `${r.codigo} ${r.estado}`).toBe(r.estado === 503);
    }
  });

  it('el mensaje público nunca arrastra el del driver', () => {
    const secreto = 'postgresql://usuario:claveSecreta@db.interno:5432/app';
    const r = clasificarError(prisma('P1001', `No se pudo conectar: ${secreto}`));
    expect(r.mensaje).not.toContain(secreto);
    expect(r.mensaje).not.toContain('claveSecreta');
    expect(r.mensaje).not.toContain('db.interno');
    expect(JSON.stringify(r)).not.toContain('P1001');
  });

  it('clasifica un error real del driver, no un doble', async () => {
    // El error viene de `pg` de verdad: confirma que los códigos de la tabla
    // coinciden con los que lanza el driver en producción.
    const pool = new pg.Pool({
      connectionString: 'postgresql://usuario:claveSecreta@127.0.0.1:1/app',
      connectionTimeoutMillis: 1_500,
    });
    let capturado: unknown;
    try {
      await pool.query('select 1');
    } catch (error) {
      capturado = error;
    } finally {
      await pool.end();
    }
    expect(capturado).toBeDefined();
    const r = clasificarError(capturado);
    expect(r.estado).toBe(503);
    expect(r.codigo).toBe('DB_NO_DISPONIBLE');
    expect(r.reintentable).toBe(true);
    expect(JSON.stringify(r)).not.toContain('claveSecreta');
  });
});
