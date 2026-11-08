import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirSesion, leerSesionDeCabecera } from '@/lib/auth/sesion';

export async function GET(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    const usuario = await bd.usuario.findUnique({
      where: { id: sesion.id },
      select: { id: true, email: true, nombre: true, rol: true, sedeId: true },
    });
    // JWT válido con fila eliminada: 401, no 500 (H-05).
    if (!usuario) return Response.json({ error: 'No autenticado' }, { status: 401 });
    return jsonOk(usuario);
  } catch (error) {
    return jsonError(error);
  }
}
