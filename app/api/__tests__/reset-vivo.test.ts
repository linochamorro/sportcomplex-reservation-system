import 'dotenv/config';
import { randomBytes, randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, describe, expect, it } from 'vitest';
import { bd } from '@/lib/db/cliente';
import { claveThrottleIp } from '@/lib/auth/throttle';
import { sha256Hex } from '@/lib/auth/validacion';
import { PUT as reset } from '../auth/recuperar/route';

const email = `reset_${randomUUID()}@prueba.local`;
const token = randomBytes(32).toString('hex');
let usuarioId = 0;

function peticion(ip: string): NextRequest {
  return new NextRequest('http://prueba/api/auth/recuperar', {
    method: 'PUT',
    headers: { 'content-type': 'application/json', 'x-real-ip': ip },
    body: JSON.stringify({ token, clave: 'Reset_Atómico_99' }),
  });
}

afterAll(async () => {
  await bd.intentoLogin.deleteMany({
    where: {
      identificador: {
        in: [claveThrottleIp(new Headers({ 'x-real-ip': '203.0.113.1' })) ?? '', claveThrottleIp(new Headers({ 'x-real-ip': '203.0.113.2' })) ?? ''],
      },
    },
  });
  await bd.passwordResetToken.deleteMany({ where: { usuarioId } });
  await bd.usuario.deleteMany({ where: { email } });
  await bd.$disconnect();
});

describe('reset de contraseña atómico', () => {
  it('dos reutilizaciones concurrentes solo cambian la contraseña una vez', async () => {
    const usuario = await bd.usuario.create({
      data: { email, passwordHash: 'antigua', nombre: 'Reset' },
    });
    usuarioId = usuario.id;
    await bd.passwordResetToken.create({
      data: {
        usuarioId,
        tokenHash: sha256Hex(token),
        expiraEn: new Date(Date.now() + 60_000),
      },
    });
    const respuestas = await Promise.all([reset(peticion('203.0.113.1')), reset(peticion('203.0.113.2'))]);
    expect(respuestas.map((respuesta) => respuesta.status).sort()).toEqual([200, 400]);
    const tokenFinal = await bd.passwordResetToken.findUniqueOrThrow({ where: { tokenHash: sha256Hex(token) } });
    expect(tokenFinal.usado).toBe(true);
  });
});
