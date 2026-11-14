import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { reasignarSolicitudTx, verificarDestinoTx } from '@/lib/domain/reasignacion';

// POST /api/canchas/[id]/reasignar — mueve un turno a otra cancha de la misma sede.
export async function POST(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'SUPERADMIN');
    const { id } = await contexto.params;
    const canchaId = Number(id);
    const cuerpo = (await peticion.json().catch(() => null)) as {
      solicitudId?: unknown;
      canchaDestinoId?: unknown;
      fecha?: unknown;
      horaInicio?: unknown;
      verificar?: unknown;
    } | null;
    const solicitudId = Number(cuerpo?.solicitudId);
    const canchaDestinoId = Number(cuerpo?.canchaDestinoId);
    const fecha = String(cuerpo?.fecha ?? '');
    const horaInicio = String(cuerpo?.horaInicio ?? '');
    if (!Number.isInteger(canchaId) || !Number.isInteger(solicitudId) || !Number.isInteger(canchaDestinoId) || !fecha || !horaInicio) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    if (cuerpo?.verificar === true) {
      const resultado = await bd.$transaction((tx) =>
        verificarDestinoTx(tx, sesion, canchaId, solicitudId, canchaDestinoId, fecha, horaInicio),
      );
      return jsonOk(resultado);
    }
    const resultado = await bd.$transaction((tx) =>
      reasignarSolicitudTx(tx, sesion, canchaId, solicitudId, canchaDestinoId, fecha, horaInicio),
    );
    return jsonOk(resultado);
  } catch (error) {
    return jsonError(error);
  }
}
