import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { aplicarVerificacionTx } from '@/lib/domain/verificacion-tx';

export async function POST(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'ADMIN', 'SUPERADMIN');
    const { id } = await contexto.params;
    const solicitudId = Number(id);
    if (!Number.isInteger(solicitudId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const resultado = await bd.$transaction((tx) =>
      aplicarVerificacionTx(tx, sesion, solicitudId, 'no_show'),
    );
    return jsonOk(resultado);
  } catch (error) {
    return jsonError(error);
  }
}
