// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET = 'x'.repeat(32);

vi.mock('../../db/cliente', () => ({
  bd: { usuario: { findUnique: vi.fn() } },
}));

import { bd } from '../../db/cliente';
import {
  cabeceraFijarSesion,
  cabeceraLimpiarSesion,
  exigirRol,
  exigirSede,
  exigirSedeRecurso,
  exigirSesion,
  firmarSesion,
  leerSesionDeCabecera,
} from '../sesion';

const fila = { id: 7, rol: 'ADMIN', sedeId: 3 };
const entorno = process.env as Record<string, string | undefined>;
const nodeEnvOriginal = process.env.NODE_ENV;
const playwrightOriginal = process.env.PLAYWRIGHT_E2E_INSECURE_COOKIES;

function restaurarEntorno(nombre: string, valor: string | undefined): void {
  if (valor === undefined) delete process.env[nombre];
  else process.env[nombre] = valor;
}

beforeEach(() => {
  vi.mocked(bd.usuario.findUnique).mockReset().mockResolvedValue(fila as never);
});

afterEach(() => {
  restaurarEntorno('NODE_ENV', nodeEnvOriginal);
  restaurarEntorno('PLAYWRIGHT_E2E_INSECURE_COOKIES', playwrightOriginal);
});

describe('guards deny-by-default (A-03/AC-04)', () => {
  it('exigirSesion sin sesión → 401', () => {
    expect(() => exigirSesion(null)).toThrowError(expect.objectContaining({ estado: 401 }));
  });

  it('exigirRol con rol distinto → 403', () => {
    expect(() => exigirRol({ id: 1, rol: 'USUARIO', sedeId: null }, 'ADMIN')).toThrowError(
      expect.objectContaining({ estado: 403 }),
    );
  });

  it('exigirSede sin sede → 403', () => {
    expect(() => exigirSede({ id: 1, rol: 'SUPERADMIN', sedeId: null })).toThrowError(
      expect.objectContaining({ estado: 403 }),
    );
  });

  it('exigirSedeRecurso cross-sede → 403; SUPERADMIN exento', () => {
    expect(() => exigirSedeRecurso({ id: 1, rol: 'ADMIN', sedeId: 3 }, 9)).toThrowError(
      expect.objectContaining({ estado: 403 }),
    );
    expect(() => exigirSedeRecurso({ id: 1, rol: 'ADMIN', sedeId: 3 }, 3)).not.toThrow();
    expect(() =>
      exigirSedeRecurso({ id: 1, rol: 'SUPERADMIN', sedeId: null }, 9),
    ).not.toThrow();
  });

  it('JWT solo transporta identidad: la autorización sale de la fila', async () => {
    const token = await firmarSesion(7);
    const sesion = await leerSesionDeCabecera(`access_token=${token}`);
    expect(sesion).toEqual({ id: 7, rol: 'ADMIN', sedeId: 3 });
    expect(vi.mocked(bd.usuario.findUnique)).toHaveBeenCalledWith({
      where: { id: 7 },
      select: { id: true, rol: true, sedeId: true },
    });
  });

  it('token expirado → null (fail-closed)', async () => {
    const { SignJWT } = await import('jose');
    const expirado = await new SignJWT({ sub: '7' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('-1h')
      .sign(new TextEncoder().encode('x'.repeat(32)));
    expect(await leerSesionDeCabecera(`access_token=${expirado}`)).toBeNull();
  });

  it('token manipulado o ausente → null (fail-closed)', async () => {
    expect(await leerSesionDeCabecera(null)).toBeNull();
    const token = await firmarSesion(7);
    expect(await leerSesionDeCabecera(`access_token=${token.slice(0, -2)}xx`)).toBeNull();
  });

  it('cookies con mismos atributos en fijar y limpiar', () => {
    const fijar = cabeceraFijarSesion('t');
    const limpiar = cabeceraLimpiarSesion();
    for (const c of [fijar, limpiar]) {
      expect(c).toContain('HttpOnly');
      expect(c).toContain('SameSite=Lax');
      expect(c).toContain('Path=/');
    }
    expect(limpiar).toContain('Max-Age=0');
  });

  it('exige Secure en producción y reserva el modo HTTP al E2E explícito', async () => {
    const { esHttps } = await import('../sesion.js');
    const http = { headers: new Headers(), nextUrl: { protocol: 'http:', host: '127.0.0.1:3100' } };
    const httpsProxy = {
      headers: new Headers({ 'x-forwarded-proto': 'https' }),
      nextUrl: { protocol: 'http:', host: '127.0.0.1:3100' },
    };
    entorno.NODE_ENV = 'development';
    delete process.env.PLAYWRIGHT_E2E_INSECURE_COOKIES;
    expect(esHttps(http)).toBe(false);
    expect(esHttps(httpsProxy)).toBe(true);
    entorno.NODE_ENV = 'production';
    expect(esHttps(http)).toBe(true);
    process.env.PLAYWRIGHT_E2E_INSECURE_COOKIES = '1';
    expect(esHttps(http)).toBe(false);
    expect(esHttps({ headers: new Headers(), nextUrl: { protocol: 'http:', host: 'app.produccion' } })).toBe(true);
    entorno.NODE_ENV = 'test';
    expect(cabeceraFijarSesion('t', false)).not.toContain('Secure');
    expect(cabeceraFijarSesion('t', true)).toContain('; Secure');
    expect(cabeceraLimpiarSesion(true)).toContain('; Secure');
  });
});
