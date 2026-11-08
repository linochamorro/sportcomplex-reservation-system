// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

process.env.JWT_SECRET = 'y'.repeat(32);

vi.mock('@/lib/auth/hash', () => ({
  hachearClave: vi.fn().mockResolvedValue('hash'),
  verificarClave: vi.fn().mockResolvedValue(false),
  trabajoDeClaveSenuelo: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/db/cliente', () => ({
  bd: {
    $queryRaw: vi.fn(),
    usuario: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    intentoLogin: { findUnique: vi.fn(), upsert: vi.fn(), update: vi.fn(), delete: vi.fn() },
    passwordResetToken: { findUnique: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
  },
}));

import { CorreoMemoria, obtenerCorreo } from '@/lib/auth/correo';
import { hachearClave, trabajoDeClaveSenuelo, verificarClave } from '@/lib/auth/hash';
import { bd } from '@/lib/db/cliente';
import { POST as login } from '../auth/login/route';
import { POST as recuperar, PUT as reset } from '../auth/recuperar/route';
import { POST as register } from '../auth/register/route';
import { POST as crearUsuario } from '../usuarios/route';
import { GET as me } from '../auth/me/route';

function peticion(ruta: string, cuerpo?: unknown, cookie?: string): NextRequest {
  return new NextRequest(`http://prueba${ruta}`, {
    method: 'POST',
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: {
      'content-type': 'application/json',
      'x-real-ip': '203.0.113.10',
      ...(cookie ? { cookie } : {}),
    },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(hachearClave).mockResolvedValue('hash');
  vi.mocked(verificarClave).mockResolvedValue(false);
  vi.mocked(trabajoDeClaveSenuelo).mockResolvedValue(undefined);
  vi.mocked(bd.$queryRaw).mockResolvedValue([{ bloqueado: false }]);
});

describe('rutas auth con mocks (A-03/AC-01..02)', () => {
  it('login: mismo 401 genérico exista o no el usuario', async () => {
    vi.mocked(bd.usuario.findUnique).mockResolvedValue(null);
    const r1 = await login(peticion('/api/auth/login', { email: 'a@b.c', clave: 'x'.repeat(9) }));
    expect(r1.status).toBe(401);
    expect(await r1.json()).toEqual({ error: 'Credenciales inválidas' });
    vi.mocked(bd.usuario.findUnique).mockResolvedValue({ passwordHash: 'h' } as never);
    const r2 = await login(peticion('/api/auth/login', { email: 'a@b.c', clave: 'mala-clave-1' }));
    expect(r2.status).toBe(401);
    expect(await r2.json()).toEqual({ error: 'Credenciales inválidas' });
    expect(verificarClave).toHaveBeenNthCalledWith(1, 'x'.repeat(9), expect.stringMatching(/^\$2b\$12\$/));
    expect(verificarClave).toHaveBeenNthCalledWith(2, 'mala-clave-1', 'h');
  });

  it('register: intento ADMIN del body termina en USUARIO sin sede', async () => {
    vi.mocked(bd.usuario.findUnique).mockResolvedValue(null);
    vi.mocked(bd.usuario.create).mockResolvedValue({} as never);
    const r = await register(
      peticion('/api/auth/register', {
        email: 'nuevo@prueba.local',
        clave: 'Secreta_99',
        rol: 'ADMIN',
        sedeId: 1,
      }),
    );
    expect(r.status).toBe(200);
    expect(vi.mocked(bd.usuario.create)).toHaveBeenCalledWith({
      data: expect.objectContaining({ rol: 'USUARIO', sedeId: null }),
    });
    expect(hachearClave).toHaveBeenCalledWith('Secreta_99');
  });

  it('POST /api/usuarios sin sesión → 401 (BD vacía no queda abierta)', async () => {
    const r = await crearUsuario(
      peticion('/api/usuarios', { email: 'x@b.c', clave: 'Secreta_99', rol: 'ADMIN', sedeId: 1 }),
    );
    expect(r.status).toBe(401);
    expect(vi.mocked(bd.usuario.create)).not.toHaveBeenCalled();
  });

  it('GET /me sin cookie → 401', async () => {
    const r = await me(new NextRequest('http://prueba/api/auth/me'));
    expect(r.status).toBe(401);
  });

  it('recuperación mantiene respuesta genérica y entrega el token por correo', async () => {
    vi.mocked(bd.usuario.findUnique).mockResolvedValue({
      id: 1,
      email: 'existe@prueba.local',
    } as never);
    vi.mocked(bd.passwordResetToken.updateMany).mockResolvedValue({ count: 0 });
    vi.mocked(bd.passwordResetToken.create).mockResolvedValue({} as never);
    const r = await recuperar(peticion('/api/auth/recuperar', { email: 'existe@prueba.local' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    const correo = obtenerCorreo() as CorreoMemoria;
    expect(correo.enviados.at(-1)?.destinatario).toBe('existe@prueba.local');
    expect(trabajoDeClaveSenuelo).toHaveBeenCalledTimes(1);
  });

  it('recuperación inexistente ejecuta el mismo trabajo sensible', async () => {
    vi.mocked(bd.usuario.findUnique).mockResolvedValue(null);
    const r = await recuperar(peticion('/api/auth/recuperar', { email: 'no-existe@prueba.local' }));
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: true });
    expect(trabajoDeClaveSenuelo).toHaveBeenCalledTimes(1);
  });

  it('register distingue la cuenta creada de la existente', async () => {
    vi.mocked(bd.usuario.findUnique).mockResolvedValue(null);
    vi.mocked(bd.usuario.create).mockResolvedValue({} as never);
    const creada = await register(
      peticion('/api/auth/register', { email: 'nueva@prueba.local', clave: 'Secreta_99', nombre: 'Nueva' }),
    );
    expect(creada.status).toBe(200);
    expect(await creada.json()).toEqual({ ok: true, creada: true });
    vi.mocked(bd.usuario.findUnique).mockResolvedValue({ id: 7 } as never);
    const existente = await register(
      peticion('/api/auth/register', { email: 'nueva@prueba.local', clave: 'Secreta_99', nombre: 'Nueva' }),
    );
    expect(existente.status).toBe(200);
    expect(await existente.json()).toEqual({ ok: true, creada: false });
  });

  it('reset atómico: token no aplicable → 400; válido → 200 un uso', async () => {
    const cuerpo = (token: string) =>
      peticion('/api/auth/recuperar', { token, clave: 'Nueva_Clave_1' }, undefined);
    vi.mocked(bd.$queryRaw)
      .mockResolvedValueOnce([{ bloqueado: false }])
      .mockResolvedValueOnce([{ aplicado: 0 }]);
    expect((await reset(cuerpo('t'.repeat(64)))).status).toBe(400);
    vi.mocked(bd.$queryRaw)
      .mockResolvedValueOnce([{ bloqueado: false }])
      .mockResolvedValueOnce([{ aplicado: 1 }]);
    expect((await reset(cuerpo('t'.repeat(64)))).status).toBe(200);
  });
});
