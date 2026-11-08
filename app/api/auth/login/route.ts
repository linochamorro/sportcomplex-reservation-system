import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { verificarClave } from '@/lib/auth/hash';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { cabeceraFijarSesion, esHttps, firmarSesion } from '@/lib/auth/sesion';
import { consumirIntento, limpiarIntentos } from '@/lib/auth/throttle';
import { normalizarEmail } from '@/lib/auth/validacion';

const GENERICO_401 = { error: 'Credenciales inválidas' };
const HASH_SENUELO = '$2b$12$d.9EkUh3IG6fHaqksHfu6.hvFyInCA7Yq28XwfoWYUbxOgVVqG9hq';

export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const cuerpo = (await peticion.json().catch(() => null)) as {
      email?: unknown;
      clave?: unknown;
    } | null;
    const email = normalizarEmail(String(cuerpo?.email ?? ''));
    const clave = String(cuerpo?.clave ?? '');
    if (await consumirIntento(`login:${email}`)) {
      return Response.json(GENERICO_401, { status: 401 });
    }
    const usuario = await bd.usuario.findUnique({ where: { email } });
    const valida = await verificarClave(clave, usuario?.passwordHash ?? HASH_SENUELO);
    if (!usuario || !valida) {
      return Response.json(GENERICO_401, { status: 401 });
    }
    await limpiarIntentos(`login:${email}`);
    const token = await firmarSesion(usuario.id);
    return jsonOk({ ok: true }, 200, cabeceraFijarSesion(token, esHttps(peticion)));
  } catch (error) {
    return jsonError(error);
  }
}
