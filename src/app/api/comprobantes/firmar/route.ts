import { NextRequest } from 'next/server';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { obtenerAlmacenamiento, type Proposito } from '@/lib/domain/almacenamiento';

// POST /api/comprobantes/firmar — devuelve una ruta generada por el servidor.
// USUARIO solo `pago`; `reembolso` solo ADMIN/SUPERADMIN (H-06/OBS-A).
export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const cuerpo = (await peticion.json().catch(() => null)) as {
      proposito?: unknown;
      extension?: unknown;
    } | null;
    const proposito = String(cuerpo?.proposito ?? 'pago') as Proposito;
    if (proposito !== 'pago' && proposito !== 'reembolso') {
      return Response.json({ error: 'Propósito inválido' }, { status: 400 });
    }
    const sesion =
      proposito === 'pago'
        ? (await import('@/lib/auth/sesion')).exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')))
        : exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'ADMIN', 'SUPERADMIN');
    void sesion;
    // Valida la extensión ANTES de tocar el almacenamiento: una entrada inválida
    // se rechaza con 400 aunque el bucket no esté configurado (fail-closed).
    const extension = String(cuerpo?.extension ?? '')
      .replace(/^\./, '')
      .toLowerCase();
    if (!['jpg', 'jpeg', 'png', 'pdf'].includes(extension)) {
      return Response.json({ error: 'La ruta del comprobante no es válida' }, { status: 400 });
    }
    const almacen = obtenerAlmacenamiento();
    const ruta = almacen.firmarRuta(proposito, extension);
    return jsonOk({ ruta });
  } catch (error) {
    return jsonError(error);
  }
}
