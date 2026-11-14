import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirSesion, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { leerCuerpoAcotado } from '@/lib/auth/cuerpo';
import { adjuntarComprobanteTx } from '@/lib/domain/comprobantes-tx';

// POST /api/solicitudes/[id]/comprobante — adjunta el comprobante de PAGO.
// El dueño es siempre el `sub` de la sesión (IDOR por diseño).
export async function POST(
  peticion: NextRequest,
  contexto: { params: Promise<{ id: string }> },
): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    const { id } = await contexto.params;
    const solicitudId = Number(id);
    if (!Number.isInteger(solicitudId)) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const bruto = await leerCuerpoAcotado(peticion);
    if (bruto === null) return Response.json({ error: 'Cuerpo demasiado grande' }, { status: 413 });
    let cuerpo: { bytesBase64?: unknown; nombreArchivo?: unknown; contentType?: unknown } | null = null;
    try {
      cuerpo = JSON.parse(bruto) as { bytesBase64?: unknown; nombreArchivo?: unknown; contentType?: unknown };
    } catch {
      cuerpo = null;
    }
    if (typeof cuerpo?.bytesBase64 !== 'string') {
      return Response.json({ error: 'Falta el comprobante' }, { status: 400 });
    }
    const bytes = Buffer.from(cuerpo.bytesBase64.replace(/\s+/g, ''), 'base64');
    const resultado = await bd.$transaction((tx) =>
      adjuntarComprobanteTx(tx, sesion, {
        solicitudId,
        proposito: 'pago',
        bytes,
        nombreArchivo: String(cuerpo?.nombreArchivo ?? ''),
        contentType: String(cuerpo?.contentType ?? ''),
      }),
    );
    return jsonOk(resultado, 201);
  } catch (error) {
    return jsonError(error);
  }
}
