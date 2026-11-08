import { randomBytes } from 'node:crypto';
import { after, NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { trabajoDeClaveSenuelo } from '@/lib/auth/hash';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { enviarRecuperacionSilencioso } from '@/lib/auth/correo';
import { claveThrottleIp, consumirIntento } from '@/lib/auth/throttle';
import { normalizarEmail, sha256Hex, validarClave } from '@/lib/auth/validacion';

const OK_GENERICO = { ok: true };
const MINUTOS_TOKEN = 30;

function programarEnvio(destinatario: string, token: string): void {
  const tarea = () => enviarRecuperacionSilencioso(destinatario, token);
  try {
    after(tarea);
  } catch {
    void tarea();
  }
}

export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const cuerpo = (await peticion.json().catch(() => null)) as { email?: unknown } | null;
    const email = normalizarEmail(String(cuerpo?.email ?? ''));
    if (await consumirIntento(`recuperar:${email}`)) return jsonOk(OK_GENERICO);
    const usuario = await bd.usuario.findUnique({ where: { email } });
    if (usuario) {
      await bd.passwordResetToken.updateMany({
        where: { usuarioId: usuario.id, usado: false },
        data: { usado: true },
      });
      const opaco = randomBytes(32).toString('hex');
      await bd.passwordResetToken.create({
        data: {
          usuarioId: usuario.id,
          tokenHash: sha256Hex(opaco),
          expiraEn: new Date(Date.now() + MINUTOS_TOKEN * 60_000),
        },
      });
      programarEnvio(usuario.email, opaco);
    }
    await trabajoDeClaveSenuelo();
    return jsonOk(OK_GENERICO);
  } catch (error) {
    return jsonError(error);
  }
}

export async function PUT(peticion: NextRequest): Promise<Response> {
  try {
    const cuerpo = (await peticion.json().catch(() => null)) as {
      token?: unknown;
      clave?: unknown;
    } | null;
    const token = String(cuerpo?.token ?? '');
    const clave = String(cuerpo?.clave ?? '');
    const claveIp = claveThrottleIp(peticion.headers);
    if (!claveIp || (await consumirIntento(claveIp))) {
      return Response.json({ error: 'Solicitud inválida' }, { status: 400 });
    }
    if (!validarClave(clave) || token.length < 32) {
      return Response.json({ error: 'Solicitud inválida' }, { status: 400 });
    }
    const { hachearClave } = await import('@/lib/auth/hash');
    const passwordHash = await hachearClave(clave);
    const resultado = await bd.$queryRaw<Array<{ aplicado: number }>>`
      WITH cerrado AS (
        UPDATE "PasswordResetToken"
        SET usado = true
        WHERE "tokenHash" = ${sha256Hex(token)}
          AND usado = false
          AND "expiraEn" > CURRENT_TIMESTAMP
        RETURNING "usuarioId"
      ), cambiada AS (
        UPDATE "Usuario" u
        SET "passwordHash" = ${passwordHash}, "actualizadoEn" = CURRENT_TIMESTAMP
        FROM cerrado
        WHERE u.id = cerrado."usuarioId"
        RETURNING u.id
      ), invalidados AS (
        UPDATE "PasswordResetToken" t
        SET usado = true
        FROM cerrado
        WHERE t."usuarioId" = cerrado."usuarioId" AND t.usado = false
        RETURNING t.id
      )
      SELECT count(*)::int AS aplicado FROM cambiada
    `;
    if (resultado[0]?.aplicado !== 1) {
      return Response.json({ error: 'Solicitud inválida' }, { status: 400 });
    }
    return jsonOk(OK_GENERICO);
  } catch (error) {
    return jsonError(error);
  }
}
