import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirSesion, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { hachearClave, verificarClave } from '@/lib/auth/hash';
import { validarClave } from '@/lib/auth/validacion';

// PUT /api/cuenta/clave — el titular cambia su clave tras verificar la actual.
export async function PUT(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    const cuerpo = (await peticion.json().catch(() => null)) as {
      actual?: unknown;
      nueva?: unknown;
    } | null;
    const actual = String(cuerpo?.actual ?? '');
    const nueva = String(cuerpo?.nueva ?? '');
    if (!validarClave(nueva) || nueva === actual) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const usuario = await bd.usuario.findUnique({ where: { id: sesion.id }, select: { passwordHash: true } });
    if (!usuario || !(await verificarClave(actual, usuario.passwordHash))) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    await bd.usuario.update({ where: { id: sesion.id }, data: { passwordHash: await hachearClave(nueva) } });
    return jsonOk({ ok: true });
  } catch (error) {
    return jsonError(error);
  }
}
