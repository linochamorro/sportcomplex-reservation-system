import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirSesion, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { validarNombre } from '@/lib/auth/validacion';

// GET /api/cuenta/perfil — el titular consulta sus datos editables.
export async function GET(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    const usuario = await bd.usuario.findUnique({
      where: { id: sesion.id },
      select: { id: true, email: true, nombre: true, telefono: true, rol: true, sedeId: true },
    });
    if (!usuario) return Response.json({ error: 'No autenticado' }, { status: 401 });
    return jsonOk(usuario);
  } catch (error) {
    return jsonError(error);
  }
}

// PUT /api/cuenta/perfil — el titular actualiza nombre y teléfono.
export async function PUT(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    const cuerpo = (await peticion.json().catch(() => null)) as {
      nombre?: unknown;
      telefono?: unknown;
    } | null;
    const nombre = String(cuerpo?.nombre ?? '').trim().slice(0, 120);
    const telefono = typeof cuerpo?.telefono === 'string' && cuerpo.telefono.trim() ? cuerpo.telefono.trim().slice(0, 30) : null;
    if (!validarNombre(nombre)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const usuario = await bd.usuario.update({
      where: { id: sesion.id },
      data: { nombre, telefono },
      select: { id: true, email: true, nombre: true, telefono: true, rol: true, sedeId: true },
    });
    return jsonOk(usuario);
  } catch (error) {
    return jsonError(error);
  }
}
