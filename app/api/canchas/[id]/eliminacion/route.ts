import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { vistaEliminacionTx } from '@/lib/domain/reasignacion';

// GET /api/canchas/[id]/eliminacion — turnos futuros y disponibilidad en la misma sede.
export async function GET(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN');
    const { id } = await contexto.params;
    const canchaId = Number(id);
    if (!Number.isInteger(canchaId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const vista = await bd.$transaction((tx) => vistaEliminacionTx(tx, sesion, canchaId));
    return jsonOk(vista);
  } catch (error) {
    return jsonError(error);
  }
}
