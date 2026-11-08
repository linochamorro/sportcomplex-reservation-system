import type { Prisma } from '../db/generated/client';
import { HttpError } from '../auth/sesion';
import { registrarCambio } from '../sync/registro';
import { transicionarSolicitud, validarMotivoRechazo, type AccionVerificacion } from './verificacion';
import { fechasVecinas, minutosDe, solapanConFecha } from './turnos';

export type ClienteTx = Prisma.TransactionClient;

const MENSAJE_SOLICITUD_NO_ENCONTRADA = 'La solicitud no existe';
const MENSAJE_SIN_PERMISO_SEDE = 'Sin permiso sobre esta sede';
const MENSAJE_BLOQUEO_VIGENTE = 'La cancha tiene un bloqueo vigente en ese horario';
const MENSAJE_HOLD_VENCIDO = 'El hold de la solicitud venció';

/**
 * Aplica una transición de verificación sobre la solicitud dentro de una
 * transacción, con autorización objeto-level: la sede se resuelve por
 * `solicitud → cancha → sede` y se compara con la del actor (SUPERADMIN exento).
 * `registrarCambio` en la misma tx (invariante 6).
 */
export async function aplicarVerificacionTx(
  tx: ClienteTx,
  sesion: { id: number; rol: 'SUPERADMIN' | 'ADMIN' | 'USUARIO'; sedeId: number | null },
  solicitudId: number,
  accion: AccionVerificacion,
  motivo?: unknown,
): Promise<{ id: number; estado: string }> {
  const solicitud = await tx.solicitud.findUnique({
    where: { id: solicitudId },
    include: { cancha: { select: { sedeId: true } } },
  });
  if (!solicitud || solicitud.eliminadoEn) throw new HttpError(404, MENSAJE_SOLICITUD_NO_ENCONTRADA);
  const sedeId = solicitud.cancha.sedeId;
  if (sesion.rol !== 'SUPERADMIN' && sesion.sedeId !== sedeId) {
    throw new HttpError(403, MENSAJE_SIN_PERMISO_SEDE);
  }

  const nuevoEstado = transicionarSolicitud(
    solicitud.estado as Parameters<typeof transicionarSolicitud>[0],
    accion,
  );

  // Confirmar re-valida bloqueo vigente (por solape, no igualdad) y hold no vencido.
  if (accion === 'confirmar') {
    if (solicitud.limiteHold && solicitud.limiteHold < new Date()) {
      throw new HttpError(409, MENSAJE_HOLD_VENCIDO);
    }
    const bloqueos = await tx.bloqueoCancha.findMany({
      where: { canchaId: solicitud.canchaId, eliminadoEn: null, fecha: { in: fechasVecinas(solicitud.fecha) } },
      select: { fecha: true, horaInicio: true, horaFin: true },
    });
    const bloqueada = bloqueos.some((b) =>
      solapanConFecha(
        solicitud.fecha,
        minutosDe(solicitud.horaInicio),
        minutosDe(solicitud.horaFin),
        b.fecha,
        minutosDe(b.horaInicio),
        minutosDe(b.horaFin),
      ),
    );
    if (bloqueada) throw new HttpError(409, MENSAJE_BLOQUEO_VIGENTE);
  }

  const esRechazo = accion === 'rechazar';
  const actualizada = await tx.solicitud.update({
    where: { id: solicitud.id },
    data: {
      estado: nuevoEstado,
      ...(esRechazo ? { motivo: validarMotivoRechazo(motivo) } : {}),
    },
  });
  await registrarCambio(tx, {
    tabla: 'Solicitud',
    filaId: actualizada.id,
    sedeId,
    usuarioId: actualizada.usuarioId,
  });
  return { id: actualizada.id, estado: actualizada.estado };
}
