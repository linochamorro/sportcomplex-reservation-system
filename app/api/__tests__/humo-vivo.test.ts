// @vitest-environment node
import 'dotenv/config';
import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
function solicitud(ruta: string, cuerpo?: unknown, cookie?: string): NextRequest {
  return new NextRequest(`http://prueba${ruta}`, {
    method: 'POST',
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
  });
}
import { POST as login } from '../auth/login/route';
import { POST as logout } from '../auth/logout/route';
import { GET as me } from '../auth/me/route';
import { POST as register } from '../auth/register/route';

// Humo vivo serial contra la BD de desarrollo (email aleatorio + limpieza).
describe.sequential('humo vivo auth (A-03)', () => {
  const email = `humo_${Date.now()}@prueba.local`;
  const clave = 'Humo_Vivo_99';
  let cookie = '';

  it('register → 201', async () => {
    const r = await register(solicitud('/api/auth/register', { email, clave, nombre: 'Humo' }));
    expect([200, 201]).toContain(r.status);
  });

  it('login → 200 con cookie', async () => {
    const r = await login(solicitud('/api/auth/login', { email, clave }));
    expect(r.status).toBe(200);
    cookie = r.headers.get('set-cookie')?.split(';')[0] ?? '';
    expect(cookie).toMatch(/^access_token=/);
  });

  it('me → 200 con rol USUARIO de la fila', async () => {
    const r = await me(
      new NextRequest('http://prueba/api/auth/me', { headers: { cookie } }),
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ email, rol: 'USUARIO' });
  });

  it('logout → 200 y me → 401', async () => {
    const r1 = await logout(new NextRequest('http://prueba/api/auth/logout', { method: 'POST' }));
    expect(r1.status).toBe(200);
    const r2 = await me(new NextRequest('http://prueba/api/auth/me'));
    expect(r2.status).toBe(401);
  });

  afterAll(async () => {
    await bd.intentoLogin.deleteMany({ where: { identificador: { contains: email } } });
    await bd.usuario.deleteMany({ where: { email } });
    await bd.$disconnect();
  });
});
