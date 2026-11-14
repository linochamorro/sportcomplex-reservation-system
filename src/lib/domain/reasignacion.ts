import type { Prisma } from '../db/generated/client';
import { HttpError } from '../auth/sesion';
import { registrarCambio } from '../sync/registro';
import { LIMA_OFFSET_MINUTOS, calcularMontoCentavos, derivarHoraFin, fechasVecinas, inicioEnLimaAUtc, minutosDe, solapanConFecha, validarVentana } from './turnos';

export type ClienteTx = Prisma.TransactionClient;
export type SesionActor = { id: number; rol: 'SUPERADMIN' | 'ADMIN' | 'USUARIO'; sedeId: number | null };

export type TurnoActivo = {
  id: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estado: 'PENDIENTE' | 'CONFIRMADA';
  usuarioId: number;
};

export type CanchaAlternativa = {
  id: number;
  nombre: string;
  estado: 'DISPONIBLE' | 'NO_DISPONIBLE';
};

function exigirSede(sesion: SesionActor, sedeId: number): void {
  if (sesion.rol !== 'SUPERADMIN' && sesion.sedeId !== sedeId) {
    throw new HttpError(403, 'Sin permiso sobre esta sede');
  }
}

function fechaLima(desfaseDias = 0): string {
  return new Date(Date.now() + desfaseDias * 86_400_000 + LIMA_OFFSET_MINUTOS * 60_000).toISOString().slice(0, 10);
}

function terminaEnFuturo(fecha: string, horaInicio: string, horaFin: string, ahora = Date.now()): boolean {
  const inicio = inicioEnLimaAUtc(fecha, horaInicio).getTime();
  let fin = inicioEnLimaAUtc(fecha, horaFin).getTime();
  if (fin <= inicio) fin += 86_400_000;
  return fin > ahora;
}

async function canchaVigente(tx: ClienteTx, canchaId: number) {
  const cancha = await tx.cancha.findUnique({
    where: { id: canchaId },
    select: { id: true, sedeId: true, nombre: true, estado: true, eliminadoEn: true },
  });
  if (!cancha || cancha.eliminadoEn) throw new HttpError(404, 'La cancha solicitada no existe');
  return cancha;
}

export async function turnosActivosDeCanchaTx(tx: ClienteTx, sesion: SesionActor, canchaId: number) {
  const cancha = await canchaVigente(tx, canchaId);
  exigirSede(sesion, cancha.sedeId);
  const candidatas = (await tx.solicitud.findMany({
    where: { canchaId, fecha: { gte: fechaLima(-1) }, eliminadoEn: null, estado: { in: ['PENDIENTE', 'CONFIRMADA'] } },
    select: { id: true, fecha: true, horaInicio: true, horaFin: true, estado: true, usuarioId: true },
    orderBy: [{ fecha: 'asc' }, { horaInicio: 'asc' }],
  })) as TurnoActivo[];
  const turnos = candidatas.filter((s) => terminaEnFuturo(s.fecha, s.horaInicio, s.horaFin));
  const alternativas = (await tx.cancha.findMany({
    where: { sedeId: cancha.sedeId, eliminadoEn: null, id: { not: canchaId } },
    select: { id: true, nombre: true, estado: true },
    orderBy: { nombre: 'asc' },
  })) as CanchaAlternativa[];
  return { cancha: { id: cancha.id, nombre: cancha.nombre, sedeId: cancha.sedeId }, turnos, alternativas };
}

async function destinoVigente(tx: ClienteTx, sesion: SesionActor, sedeId: number, canchaDestinoId: number) {
  const destino = await canchaVigente(tx, canchaDestinoId);
  if (destino.sedeId !== sedeId) throw new HttpError(400, 'La cancha destino debe ser de la misma sede');
  exigirSede(sesion, destino.sedeId);
  if (destino.estado !== 'DISPONIBLE') throw new HttpError(409, 'La cancha destino no está disponible');
  return destino;
}

async function turnoLibre(
  tx: ClienteTx,
  canchaDestinoId: number,
  solicitudId: number,
  fecha: string,
  horaInicio: string,
  horaFin: string,
): Promise<boolean> {
  const reservas = await tx.solicitud.findMany({
    where: {
      canchaId: canchaDestinoId,
      fecha: { in: fechasVecinas(fecha) },
      eliminadoEn: null,
      id: { not: solicitudId },
      estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
    },
    select: { fecha: true, horaInicio: true, horaFin: true },
  });
  return !reservas.some((r) =>
    solapanConFecha(fecha, minutosDe(horaInicio), minutosDe(horaFin), r.fecha, minutosDe(r.horaInicio), minutosDe(r.horaFin)),
  );
}

export async function vistaEliminacionTx(tx: ClienteTx, sesion: SesionActor, canchaId: number) {
  const { cancha, turnos, alternativas } = await turnosActivosDeCanchaTx(tx, sesion, canchaId);
  const turnosConDisponibilidad = await Promise.all(
    turnos.map(async (turno) => ({
      ...turno,
      alternativas: await Promise.all(
        alternativas.map(async (alternativa) => ({
          ...alternativa,
          libre:
            alternativa.estado === 'DISPONIBLE' &&
            (await turnoLibre(tx, alternativa.id, turno.id, turno.fecha, turno.horaInicio, turno.horaFin)),
        })),
      ),
    })),
  );
  return { cancha, turnos: turnosConDisponibilidad, alternativas };
}

export async function verificarDestinoTx(
  tx: ClienteTx,
  sesion: SesionActor,
  canchaOrigenId: number,
  solicitudId: number,
  canchaDestinoId: number,
  fecha: string,
  horaInicio: string,
): Promise<{ libre: boolean }> {
  const solicitud = await tx.solicitud.findUnique({ where: { id: solicitudId } });
  if (!solicitud || solicitud.eliminadoEn || (solicitud.estado !== 'PENDIENTE' && solicitud.estado !== 'CONFIRMADA')) {
    throw new HttpError(404, 'El turno seleccionado no existe');
  }
  if (solicitud.canchaId !== canchaOrigenId) throw new HttpError(400, 'El turno no pertenece a esta cancha');
  const origen = await canchaVigente(tx, solicitud.canchaId);
  const destino = await destinoVigente(tx, sesion, origen.sedeId, canchaDestinoId);
  void destino;
  const horaFin = derivarHoraFin(horaInicio);
  inicioEnLimaAUtc(fecha, horaInicio);
  return { libre: await turnoLibre(tx, canchaDestinoId, solicitudId, fecha, horaInicio, horaFin) };
}

export async function reasignarSolicitudTx(
  tx: ClienteTx,
  sesion: SesionActor,
  canchaOrigenId: number,
  solicitudId: number,
  canchaDestinoId: number,
  fecha: string,
  horaInicio: string,
) {
  const solicitud = await tx.solicitud.findUnique({ where: { id: solicitudId } });
  if (!solicitud || solicitud.eliminadoEn || (solicitud.estado !== 'PENDIENTE' && solicitud.estado !== 'CONFIRMADA')) {
    throw new HttpError(404, 'El turno seleccionado no existe');
  }
  if (solicitud.canchaId !== canchaOrigenId) throw new HttpError(400, 'El turno no pertenece a esta cancha');
  const origen = await canchaVigente(tx, solicitud.canchaId);
  const destino = await destinoVigente(tx, sesion, origen.sedeId, canchaDestinoId);
  const horaFin = derivarHoraFin(horaInicio);
  validarVentana(inicioEnLimaAUtc(fecha, horaInicio), new Date());
  if (!(await turnoLibre(tx, canchaDestinoId, solicitudId, fecha, horaInicio, horaFin))) {
    throw new HttpError(409, 'El turno destino ya está reservado');
  }
  const destinoBase = await tx.cancha.findUnique({ where: { id: canchaDestinoId }, select: { tarifaBaseCentavos: true } });
  const tarifas = await tx.tarifa.findMany({
    where: { sedeId: origen.sedeId, eliminadoEn: null },
    select: { horaInicio: true, horaFin: true, montoCentavos: true, diasSemana: true },
  });
  const actualizada = await tx.solicitud.update({
    where: { id: solicitudId },
    data: {
      canchaId: canchaDestinoId,
      fecha,
      horaInicio,
      horaFin,
      montoTotalCentavos: calcularMontoCentavos({
        horaInicio,
        tarifaBaseCentavos: destinoBase?.tarifaBaseCentavos ?? 0,
        tarifas,
        fecha,
      }),
    },
    select: { id: true, canchaId: true, fecha: true, horaInicio: true, horaFin: true, estado: true, montoTotalCentavos: true },
  });
  await registrarCambio(tx, { tabla: 'Solicitud', filaId: actualizada.id, sedeId: origen.sedeId, usuarioId: solicitud.usuarioId });
  return { ...actualizada, canchaDestino: destino.nombre };
}

export async function eliminarCanchaTx(tx: ClienteTx, sesion: SesionActor, canchaId: number) {
  const { cancha, turnos } = await turnosActivosDeCanchaTx(tx, sesion, canchaId);
  if (turnos.length > 0) {
    throw new HttpError(409, 'La cancha tiene turnos activos asignados');
  }
  await tx.cancha.update({ where: { id: cancha.id }, data: { eliminadoEn: new Date() } });
  await registrarCambio(tx, { tabla: 'Cancha', filaId: cancha.id, sedeId: cancha.sedeId, eliminado: true });
  return { ok: true as const };
}
