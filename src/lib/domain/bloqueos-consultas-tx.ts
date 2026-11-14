import type { Prisma } from '../db/generated/client';
import { HttpError } from '../auth/sesion';
import { registrarCambio } from '../sync/registro';
import { bloqueoAfectaSolicitud, clasificarAfectada, validarBloqueo } from './bloqueos';
import { fechasVecinas } from './turnos';
import { adjuntarComprobanteTx } from './comprobantes-tx';

export type ClienteTx = Prisma.TransactionClient;
export type SesionActor = { id: number; rol: 'SUPERADMIN' | 'ADMIN' | 'USUARIO'; sedeId: number | null };

const MENSAJE_CANCHA_NO_ACCESIBLE = 'Sin permiso sobre esta sede';
const MENSAJE_BLOQUEO_NO_ENCONTRADO = 'El bloqueo no existe';

export async function sedeDeCancha(tx: ClienteTx, canchaId: number): Promise<number> {
  const cancha = await tx.cancha.findUnique({ where: { id: canchaId }, select: { sedeId: true, eliminadoEn: true } });
  if (!cancha || cancha.eliminadoEn) throw new HttpError(404, 'La cancha solicitada no existe');
  return cancha.sedeId;
}

export function exigirSede(sesion: SesionActor, sedeId: number): void {
  if (sesion.rol !== 'SUPERADMIN' && sesion.sedeId !== sedeId) {
    throw new HttpError(403, MENSAJE_CANCHA_NO_ACCESIBLE);
  }
}

/**
 * Crea un bloqueo y aplica su efecto sobre las reservas que solapa:
 * `PENDIENTE` → `CANCELADA` (sin reembolso), `CONFIRMADA` → queda a decisión
 * (reasignar/reembolsar). Todo dentro de la transacción, con `registrarCambio`.
 */
export async function crearBloqueoTx(
  tx: ClienteTx,
  sesion: SesionActor,
  entrada: { canchaId: number; fecha: string; horaInicio: unknown; horaFin: unknown; motivo: unknown },
): Promise<{ id: number; afectadas: number; canceladas: number }> {
  const sedeId = await sedeDeCancha(tx, entrada.canchaId);
  exigirSede(sesion, sedeId);
  const datos = validarBloqueo(entrada);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(entrada.fecha)) throw new HttpError(400, 'Fecha inválida');

  const bloqueo = await tx.bloqueoCancha.create({
    data: {
      canchaId: entrada.canchaId,
      fecha: entrada.fecha,
      horaInicio: datos.horaInicio,
      horaFin: datos.horaFin,
      motivo: datos.motivo,
    },
  });
  await registrarCambio(tx, { tabla: 'BloqueoCancha', filaId: bloqueo.id, sedeId });

  // Ventana ±1 día: un bloqueo que cruza medianoche afecta al día siguiente.
  const delDia = await tx.solicitud.findMany({
    where: {
      canchaId: entrada.canchaId,
      fecha: { in: fechasVecinas(entrada.fecha) },
      eliminadoEn: null,
      estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
    },
    select: { id: true, usuarioId: true, fecha: true, horaInicio: true, horaFin: true, estado: true },
  });
  let canceladas = 0;
  const afectadas = delDia.filter((s) =>
    bloqueoAfectaSolicitud(
      { fecha: bloqueo.fecha, horaInicio: bloqueo.horaInicio, horaFin: bloqueo.horaFin },
      s,
    ),
  );
  for (const s of afectadas) {
    if (clasificarAfectada(s.estado as Parameters<typeof clasificarAfectada>[0]) === 'CANCELAR_SIN_REEMBOLSO') {
      await tx.solicitud.update({ where: { id: s.id }, data: { estado: 'CANCELADA', motivo: `bloqueo: ${datos.motivo}` } });
      await registrarCambio(tx, { tabla: 'Solicitud', filaId: s.id, sedeId, usuarioId: s.usuarioId });
      canceladas += 1;
    }
  }
  return { id: bloqueo.id, afectadas: afectadas.length, canceladas };
}

/** Lista las reservas afectadas por un bloqueo (CONFIRMADA y PENDIENTE). */
export async function afectadasDeBloqueoTx(
  tx: ClienteTx,
  sesion: SesionActor,
  bloqueoId: number,
): Promise<Array<{ id: number; estado: string; accion: string | null }>> {
  const bloqueo = await tx.bloqueoCancha.findUnique({ where: { id: bloqueoId } });
  if (!bloqueo || bloqueo.eliminadoEn) throw new HttpError(404, MENSAJE_BLOQUEO_NO_ENCONTRADO);
  const sedeId = await sedeDeCancha(tx, bloqueo.canchaId);
  exigirSede(sesion, sedeId);
  const solicitudes = await tx.solicitud.findMany({
    where: { canchaId: bloqueo.canchaId, fecha: { in: fechasVecinas(bloqueo.fecha) }, eliminadoEn: null },
    select: { id: true, estado: true, fecha: true, horaInicio: true, horaFin: true },
  });
  const acciones = await tx.accionReservaAfectada.findMany({ where: { bloqueoId } });
  return solicitudes
    .filter((s) =>
      bloqueoAfectaSolicitud(
        { fecha: bloqueo.fecha, horaInicio: bloqueo.horaInicio, horaFin: bloqueo.horaFin },
        s,
      ),
    )
    .map((s) => ({
      id: s.id,
      estado: s.estado,
      accion: acciones.find((a) => a.solicitudId === s.id)?.accion ?? null,
    }));
}
