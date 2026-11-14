import type { Prisma } from '../db/generated/client';
import { HttpError } from '../auth/sesion';
import { registrarCambio } from '../sync/registro';
import { validarComprobanteBytes, extensionDeRuta } from './comprobantes';
import { obtenerAlmacenamiento, type Proposito } from './almacenamiento';

export type ClienteTx = Prisma.TransactionClient;
export type SesionActor = { id: number; rol: 'SUPERADMIN' | 'ADMIN' | 'USUARIO'; sedeId: number | null };

const MENSAJE_SOLICITUD_NO_ENCONTRADA = 'La solicitud no existe';
const MENSAJE_SIN_PERMISO = 'Sin permiso sobre esta solicitud';

function propositoEnum(p: Proposito): 'PAGO' | 'REEMBOLSO' {
  return p === 'pago' ? 'PAGO' : 'REEMBOLSO';
}

/**
 * Adjunta un comprobante (bytes reales) a una solicitud, con idempotencia por
 * `(solicitudId, proposito)` (BLQ-1): PAGO se reemplaza (upsert), REEMBOLSO es
 * terminal. El servidor sube/revalida los bytes y persiste metadata derivada.
 * `registrarCambio` de `Comprobante` con sedeId/usuarioId derivados (H-02).
 */
export async function adjuntarComprobanteTx(
  tx: ClienteTx,
  sesion: SesionActor,
  entrada: {
    solicitudId: number;
    proposito: Proposito;
    bytes: Buffer;
    nombreArchivo: string;
    contentType: string;
    /** Solo ADMIN/SUPERADMIN pueden adjuntar REEMBOLSO. */
  },
): Promise<{ id: number; rutaStorage: string; proposito: Proposito }> {
  const solicitud = await tx.solicitud.findUnique({
    where: { id: entrada.solicitudId },
    include: { cancha: { select: { sedeId: true } } },
  });
  if (!solicitud || solicitud.eliminadoEn) throw new HttpError(404, MENSAJE_SOLICITUD_NO_ENCONTRADA);
  const sedeId = solicitud.cancha.sedeId;
  // Autorización objeto-level (F-01): USUARIO solo su propia solicitud;
  // ADMIN solo su sede; SUPERADMIN exento. Aplica a PAGO y REEMBOLSO.
  if (sesion.rol === 'USUARIO') {
    if (solicitud.usuarioId !== sesion.id) throw new HttpError(404, MENSAJE_SOLICITUD_NO_ENCONTRADA);
  } else if (sesion.rol === 'ADMIN' && sesion.sedeId !== sedeId) {
    throw new HttpError(403, MENSAJE_SIN_PERMISO);
  }

  const validado = validarComprobanteBytes(entrada.bytes, {
    nombreArchivo: entrada.nombreArchivo,
    contentType: entrada.contentType,
    tamanoBytes: entrada.bytes.length,
  });
  const extension = extensionDeRuta(entrada.nombreArchivo);
  const almacen = obtenerAlmacenamiento();
  const ruta = almacen.firmarRuta(entrada.proposito, extension);
  await almacen.subir(ruta, entrada.bytes, entrada.contentType);

  const existente = await tx.comprobante.findUnique({
    where: { solicitudId_proposito: { solicitudId: solicitud.id, proposito: propositoEnum(entrada.proposito) } },
  });
  // REEMBOLSO es terminal e idempotente (F-03): si ya existe, se devuelve sin
  // duplicar ni reemplazar. PAGO se reemplaza (upsert).
  if (existente && entrada.proposito === 'reembolso') {
    return { id: existente.id, rutaStorage: existente.rutaStorage, proposito: entrada.proposito };
  }

  const guardado = existente
    ? await tx.comprobante.update({
        where: { id: existente.id },
        data: { rutaStorage: ruta, bytes: validado.tamanoBytes, contentType: entrada.contentType },
      })
    : await tx.comprobante.create({
        data: {
          solicitudId: solicitud.id,
          proposito: propositoEnum(entrada.proposito),
          rutaStorage: ruta,
          bytes: validado.tamanoBytes,
          contentType: entrada.contentType,
        },
      });
  await registrarCambio(tx, {
    tabla: 'Comprobante',
    filaId: guardado.id,
    sedeId,
    usuarioId: solicitud.usuarioId,
  });
  return { id: guardado.id, rutaStorage: guardado.rutaStorage, proposito: entrada.proposito };
}

