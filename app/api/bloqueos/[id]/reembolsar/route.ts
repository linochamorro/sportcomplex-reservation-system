import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { leerCuerpoAcotado } from '@/lib/auth/cuerpo';
import { reembolsarTx } from '@/lib/domain/bloqueos-tx';

// Marca la reserva como reembolsada (comprobante REEMBOLSO con bytes reales).
export async function POST(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'ADMIN', 'SUPERADMIN');
    const { id } = await contexto.params;
    const bloqueoId = Number(id);
    if (!Number.isInteger(bloqueoId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const bruto = await leerCuerpoAcotado(peticion);
    if (bruto === null) return Response.json({ error: 'Cuerpo demasiado grande' }, { status: 413 });
    let cuerpo: { solicitudId?: unknown; bytesBase64?: unknown; nombreArchivo?: unknown; contentType?: unknown } | null = null;
    try {
      cuerpo = JSON.parse(bruto) as { solicitudId?: unknown; bytesBase64?: unknown; nombreArchivo?: unknown; contentType?: unknown };
    } catch {
      cuerpo = null;
    }
    const solicitudId = Number(cuerpo?.solicitudId);
    if (!Number.isInteger(solicitudId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    if (typeof cuerpo?.bytesBase64 !== 'string') {
      return Response.json({ error: 'El comprobante de reembolso es obligatorio' }, { status: 400 });
    }
    const bytes = Buffer.from(cuerpo.bytesBase64.replace(/\s+/g, ''), 'base64');
    const resultado = await bd.$transaction((tx) =>
      reembolsarTx(tx, sesion, bloqueoId, solicitudId, {
        bytes,
        nombreArchivo: String(cuerpo?.nombreArchivo ?? ''),
        contentType: String(cuerpo?.contentType ?? ''),
      }),
    );
    return jsonOk(resultado);
  } catch (error) {
    return jsonError(error);
  }
}
