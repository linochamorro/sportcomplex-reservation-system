import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { afectadasDeBloqueoTx } from '@/lib/domain/bloqueos-tx';

export async function GET(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'ADMIN', 'SUPERADMIN');
    const { id } = await contexto.params;
    const bloqueoId = Number(id);
    if (!Number.isInteger(bloqueoId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const afectadas = await bd.$transaction((tx) => afectadasDeBloqueoTx(tx, sesion, bloqueoId));
    return jsonOk({ afectadas });
  } catch (error) {
    return jsonError(error);
  }
}
