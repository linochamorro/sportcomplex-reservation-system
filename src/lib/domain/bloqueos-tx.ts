import type { Prisma } from '../db/generated/client';
import { HttpError } from '../auth/sesion';
import { registrarCambio } from '../sync/registro';
import { bloqueoAfectaSolicitud } from './bloqueos';
import { exigirSede, sedeDeCancha } from './bloqueos-consultas-tx';
import { adjuntarComprobanteTx } from './comprobantes-tx';

export type ClienteTx = Prisma.TransactionClient;
export type SesionActor = { id: number; rol: 'SUPERADMIN' | 'ADMIN' | 'USUARIO'; sedeId: number | null };

const MENSAJE_BLOQUEO_NO_ENCONTRADO = 'El bloqueo no existe';

/** Reasigna una reserva CONFIRMADA afectada a otro slot de la misma sede. */
export async function reasignarTx(
  tx: ClienteTx,
  sesion: SesionActor,
  bloqueoId: number,
  solicitudId: number,
  destino: { fecha: string; horaInicio: string; horaFin: string },
): Promise<{ id: number; fecha: string; horaInicio: string }> {
  const bloqueo = await tx.bloqueoCancha.findUnique({ where: { id: bloqueoId } });
  if (!bloqueo || bloqueo.eliminadoEn) throw new HttpError(404, MENSAJE_BLOQUEO_NO_ENCONTRADO);
  const sedeId = await sedeDeCancha(tx, bloqueo.canchaId);
  exigirSede(sesion, sedeId);
  const solicitud = await tx.solicitud.findUnique({ where: { id: solicitudId } });
  if (!solicitud || solicitud.eliminadoEn || solicitud.canchaId !== bloqueo.canchaId) {
    throw new HttpError(404, 'La solicitud no existe');
  }
  if (solicitud.estado !== 'CONFIRMADA') throw new HttpError(409, 'Solo una reserva confirmada puede reasignarse');
  // El destino no puede seguir dentro del propio bloqueo.
  if (
    bloqueoAfectaSolicitud(
      { fecha: bloqueo.fecha, horaInicio: bloqueo.horaInicio, horaFin: bloqueo.horaFin },
      destino,
    )
  ) {
    throw new HttpError(409, 'El destino sigue dentro del bloqueo');
  }
  // El destino debe estar libre en la misma cancha.
  const choques = await tx.solicitud.findMany({
    where: {
      canchaId: bloqueo.canchaId,
      fecha: destino.fecha,
      eliminadoEn: null,
      id: { not: solicitudId },
      estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
    },
    select: { fecha: true, horaInicio: true, horaFin: true },
  });
  if (choques.some((c) => bloqueoAfectaSolicitud(destino, c))) {
    throw new HttpError(409, 'El destino ya está reservado');
  }
  await tx.accionReservaAfectada.upsert({
    where: { bloqueoId_solicitudId: { bloqueoId, solicitudId } },
    create: { bloqueoId, solicitudId, accion: 'REASIGNADA', detalle: `${destino.fecha} ${destino.horaInicio}` },
    update: { accion: 'REASIGNADA', detalle: `${destino.fecha} ${destino.horaInicio}` },
  });
  const actualizada = await tx.solicitud.update({
    where: { id: solicitudId },
    data: { fecha: destino.fecha, horaInicio: destino.horaInicio, horaFin: destino.horaFin, estado: 'CONFIRMADA' },
  });
  await registrarCambio(tx, { tabla: 'Solicitud', filaId: actualizada.id, sedeId, usuarioId: actualizada.usuarioId });
  return { id: actualizada.id, fecha: actualizada.fecha, horaInicio: actualizada.horaInicio };
}

/**
 * Cierra el reembolso de una reserva CONFIRMADA afectada. Exige el comprobante
 * REEMBOLSO con bytes reales (B-04/AC-04): sin bytes → 400. Marca
 * `AccionReservaAfectada(REEMBOLSADA)` con detalle final y cancela la reserva.
 * Idempotente: si ya existe comprobante con la misma ruta, no duplica.
 */
export async function reembolsarTx(
  tx: ClienteTx,
  sesion: SesionActor,
  bloqueoId: number,
  solicitudId: number,
  comprobante: { bytes: Buffer; nombreArchivo: string; contentType: string },
): Promise<{ id: number; estado: string; comprobanteId: number }> {
  const bloqueo = await tx.bloqueoCancha.findUnique({ where: { id: bloqueoId } });
  if (!bloqueo || bloqueo.eliminadoEn) throw new HttpError(404, MENSAJE_BLOQUEO_NO_ENCONTRADO);
  const sedeId = await sedeDeCancha(tx, bloqueo.canchaId);
  exigirSede(sesion, sedeId);
  const solicitud = await tx.solicitud.findUnique({ where: { id: solicitudId } });
  if (!solicitud || solicitud.eliminadoEn || solicitud.canchaId !== bloqueo.canchaId) {
    throw new HttpError(404, 'La solicitud no existe');
  }
  // Idempotencia (F-03): si ya existe el comprobante REEMBOLSO de esta
  // solicitud, devolverlo sin exigir el estado CONFIRMADA (ya se canceló).
  const yaReembolsado = await tx.comprobante.findUnique({
    where: { solicitudId_proposito: { solicitudId, proposito: 'REEMBOLSO' } },
  });
  if (yaReembolsado) {
    return { id: solicitudId, estado: solicitud.estado, comprobanteId: yaReembolsado.id };
  }
  if (solicitud.estado !== 'CONFIRMADA') throw new HttpError(409, 'Solo una reserva confirmada puede reembolsarse');
  // Solo se reembolsa una reserva realmente afectada por el bloqueo (F-10).
  if (
    !bloqueoAfectaSolicitud(
      { fecha: bloqueo.fecha, horaInicio: bloqueo.horaInicio, horaFin: bloqueo.horaFin },
      { fecha: solicitud.fecha, horaInicio: solicitud.horaInicio, horaFin: solicitud.horaFin },
    )
  ) {
    throw new HttpError(409, 'La reserva no está afectada por este bloqueo');
  }
  const comp = await adjuntarComprobanteTx(tx, sesion, {
    solicitudId,
    proposito: 'reembolso',
    bytes: comprobante.bytes,
    nombreArchivo: comprobante.nombreArchivo,
    contentType: comprobante.contentType,
  });
  await tx.accionReservaAfectada.upsert({
    where: { bloqueoId_solicitudId: { bloqueoId, solicitudId } },
    create: { bloqueoId, solicitudId, accion: 'REEMBOLSADA', detalle: `comprobante:${comp.id}` },
    update: { accion: 'REEMBOLSADA', detalle: `comprobante:${comp.id}` },
  });
  const actualizada = await tx.solicitud.update({
    where: { id: solicitudId },
    data: { estado: 'CANCELADA', motivo: 'reembolso por bloqueo' },
  });
  await registrarCambio(tx, { tabla: 'Solicitud', filaId: actualizada.id, sedeId, usuarioId: actualizada.usuarioId });
  return { id: actualizada.id, estado: actualizada.estado, comprobanteId: comp.id };
}

export { crearBloqueoTx, afectadasDeBloqueoTx } from './bloqueos-consultas-tx';
