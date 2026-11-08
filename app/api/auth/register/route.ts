import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { hachearClave } from '@/lib/auth/hash';
import { consumirIntento } from '@/lib/auth/throttle';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { normalizarEmail, validarClave, validarEmail, validarNombre } from '@/lib/auth/validacion';

const OK_GENERICO = { ok: true, creada: false };

export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const cuerpo = (await peticion.json().catch(() => null)) as {
      email?: unknown;
      clave?: unknown;
      nombre?: unknown;
      telefono?: unknown;
    } | null;
    const email = normalizarEmail(String(cuerpo?.email ?? ''));
    if (await consumirIntento(`registro:${email}`)) return jsonOk(OK_GENERICO);
    const nombre = String(cuerpo?.nombre ?? '').trim().slice(0, 120);
    if (!validarEmail(email) || !validarClave(String(cuerpo?.clave ?? '')) || !validarNombre(nombre || email)) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const passwordHash = await hachearClave(String(cuerpo?.clave));
    const existente = await bd.usuario.findUnique({ where: { email } });
    if (existente) return jsonOk(OK_GENERICO);
    // Whitelist explícita: rol y sede fijados en servidor, nunca del body.
    await bd.usuario.create({
      data: {
        email,
        passwordHash,
        nombre: nombre || email,
        telefono: typeof cuerpo?.telefono === 'string' ? cuerpo.telefono.slice(0, 30) : null,
        rol: 'USUARIO',
        sedeId: null,
      },
    });
    // Paridad anti-enumeración: mismo status exista o no (H-02).
    return jsonOk({ ok: true, creada: true });
  } catch (error) {
    return jsonError(error);
  }
}
