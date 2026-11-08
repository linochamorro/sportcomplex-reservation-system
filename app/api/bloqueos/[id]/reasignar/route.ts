import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { reasignarTx } from '@/lib/domain/bloqueos-tx';

export async function POST(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'ADMIN', 'SUPERADMIN');
    const { id } = await contexto.params;
    const bloqueoId = Number(id);
    if (!Number.isInteger(bloqueoId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const cuerpo = (await peticion.json().catch(() => null)) as {
      solicitudId?: unknown;
      fecha?: unknown;
      horaInicio?: unknown;
      horaFin?: unknown;
    } | null;
    const solicitudId = Number(cuerpo?.solicitudId);
    if (!Number.isInteger(solicitudId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const resultado = await bd.$transaction((tx) =>
      reasignarTx(tx, sesion, bloqueoId, solicitudId, {
        fecha: String(cuerpo?.fecha ?? ''),
        horaInicio: String(cuerpo?.horaInicio ?? ''),
        horaFin: String(cuerpo?.horaFin ?? ''),
      }),
    );
    return jsonOk(resultado);
  } catch (error) {
    return jsonError(error);
  }
}
