import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirSesion, leerSesionDeCabecera } from '@/lib/auth/sesion';

// GET /api/notificaciones — centro propio, paginado simple. Solo las suyas.
export async function GET(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    const notificaciones = await bd.notificacion.findMany({
      where: { usuarioId: sesion.id, eliminadoEn: null },
      orderBy: { creadoEn: 'desc' },
      take: 50,
      select: { id: true, tipo: true, titulo: true, cuerpo: true, leida: true, solicitudId: true, creadoEn: true },
    });
    return jsonOk({ notificaciones });
  } catch (error) {
    return jsonError(error);
  }
}
