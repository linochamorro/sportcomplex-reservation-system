import type { Prisma } from '../db/generated/client';
import { HttpError } from '../auth/sesion';
import { registrarCambio } from '../sync/registro';
import {
  HOLD_MINUTOS,
  MAX_INTENTOS,
  calcularMontoCentavos,
  derivarHoraFin,
  fechasVecinas,
  inicioEnLimaAUtc,
  minutosDe,
  solapanConFecha,
  validarReserva,
  validarTurnoEnSede,
} from './turnos';

export type ClienteTx = Prisma.TransactionClient;

export type EntradaCrearSolicitud = {
  usuarioId: number;
  canchaId: number;
  fecha: string;
  horaInicio: string;
  ahora?: Date;
  /** Sede del actor, si la tiene: un USUARIO con sede no puede reservar fuera. */
  sedePermitida?: number | null;
};

export type SolicitudCreada = {
  id: number;
  usuarioId: number;
  canchaId: number;
  sedeId: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estado: 'PENDIENTE';
  intento: number;
  montoTotalCentavos: number;
  limiteHold: string;
  creadoEn: string;
};

const MENSAJE_CANCHA_NO_ENCONTRADA = 'La cancha solicitada no existe';
const MENSAJE_CANCHA_NO_DISPONIBLE = 'La cancha seleccionada no está disponible';
const MENSAJE_SEDE_NO_DISPONIBLE = 'La sede de la cancha seleccionada no está disponible';
const MENSAJE_HORARIO_OCUPADO = 'El horario seleccionado ya está reservado para esa cancha';
const MENSAJE_CANCHA_BLOQUEADA =
  'La cancha no está disponible en el horario seleccionado por un bloqueo vigente';
const MENSAJE_SIN_INTENTOS = 'No quedan intentos disponibles para este horario';

/**
 * Caso de uso compartido por el endpoint online y el procesador offline
 * (contrato v1). Debe ejecutarse DENTRO de una transacción: el lock
 * `FOR UPDATE` sobre `Cancha` serializa la creación y evita doble booking.
 * El hold nace aquí, con el reloj del servidor.
 */
export async function crearSolicitudTx(
  tx: ClienteTx,
  entrada: EntradaCrearSolicitud,
): Promise<SolicitudCreada> {
  const ahora = entrada.ahora ?? new Date();
  const inicioUtc = inicioEnLimaAUtc(entrada.fecha, entrada.horaInicio);
  const horaFin = derivarHoraFin(entrada.horaInicio);
  validarReserva(inicioUtc, ahora, entrada.horaInicio);

  // Lock de la cancha: serializa los intentos concurrentes del mismo slot.
  await tx.$queryRaw`SELECT id FROM "Cancha" WHERE id = ${entrada.canchaId} FOR UPDATE`;

  const cancha = await tx.cancha.findUnique({ where: { id: entrada.canchaId } });
  if (!cancha || cancha.eliminadoEn) throw new HttpError(404, MENSAJE_CANCHA_NO_ENCONTRADA);
  if (cancha.estado !== 'DISPONIBLE') throw new HttpError(409, MENSAJE_CANCHA_NO_DISPONIBLE);
  // F-05: un actor con sede propia solo reserva en canchas de su sede.
  if (entrada.sedePermitida != null && cancha.sedeId !== entrada.sedePermitida) {
    throw new HttpError(403, 'Sin permiso sobre esta sede');
  }
  const sede = await tx.sede.findUnique({ where: { id: cancha.sedeId } });
  if (!sede || sede.eliminadoEn) throw new HttpError(400, MENSAJE_SEDE_NO_DISPONIBLE);
  // QA-01: el turno debe estar dentro del horario de la sede (también vía API/sync).
  validarTurnoEnSede(entrada.horaInicio, horaFin, sede.apertura, sede.cierre);

  const bloqueantes = await tx.solicitud.findMany({
    where: {
      canchaId: entrada.canchaId,
      // Ventana ±1 día: una reserva de 23:30 puede terminar 00:30 del día
      // siguiente, así que el solape no puede restringirse al mismo `fecha`.
      fecha: { in: fechasVecinas(entrada.fecha) },
      eliminadoEn: null,
      estado: { in: ['PENDIENTE', 'CONFIRMADA'] },
    },
    select: { fecha: true, horaInicio: true, horaFin: true },
  });
  const inicioMin = minutosDe(entrada.horaInicio);
  const finMin = minutosDe(horaFin);
  const ocupada = bloqueantes.some((otra) =>
    solapanConFecha(
      entrada.fecha,
      inicioMin,
      finMin,
      otra.fecha,
      minutosDe(otra.horaInicio),
      minutosDe(otra.horaFin),
    ),
  );
  if (ocupada) throw new HttpError(409, MENSAJE_HORARIO_OCUPADO);

  const bloqueos = await tx.bloqueoCancha.findMany({
    where: { canchaId: entrada.canchaId, fecha: { in: fechasVecinas(entrada.fecha) }, eliminadoEn: null },
    select: { fecha: true, horaInicio: true, horaFin: true },
  });
  const bloqueada = bloqueos.some((b) =>
    solapanConFecha(
      entrada.fecha,
      inicioMin,
      finMin,
      b.fecha,
      minutosDe(b.horaInicio),
      minutosDe(b.horaFin),
    ),
  );
  if (bloqueada) throw new HttpError(409, MENSAJE_CANCHA_BLOQUEADA);

  // Intento: si ya hubo un rechazo del mismo slot por el mismo usuario, es el 2.º.
  const rechazada = await tx.solicitud.findFirst({
    where: {
      usuarioId: entrada.usuarioId,
      canchaId: entrada.canchaId,
      fecha: entrada.fecha,
      horaInicio: entrada.horaInicio,
      estado: 'RECHAZADA',
      eliminadoEn: null,
    },
    orderBy: { intento: 'desc' },
    select: { intento: true },
  });
  const intento = rechazada ? rechazada.intento + 1 : 1;
  if (intento > MAX_INTENTOS) throw new HttpError(409, MENSAJE_SIN_INTENTOS);

  const tarifas = await tx.tarifa.findMany({
    where: { sedeId: cancha.sedeId, eliminadoEn: null },
    select: { horaInicio: true, horaFin: true, montoCentavos: true, diasSemana: true },
  });
  const montoTotalCentavos = calcularMontoCentavos({
    horaInicio: entrada.horaInicio,
    tarifaBaseCentavos: cancha.tarifaBaseCentavos,
    tarifas,
    fecha: entrada.fecha,
  });
  const limiteHold = new Date(ahora.getTime() + HOLD_MINUTOS * 60_000);

  try {
    const creada = await tx.solicitud.create({
      data: {
        usuarioId: entrada.usuarioId,
        canchaId: entrada.canchaId,
        fecha: entrada.fecha,
        horaInicio: entrada.horaInicio,
        horaFin,
        estado: 'PENDIENTE',
        intento,
        montoTotalCentavos,
        limiteHold,
      },
    });
    await registrarCambio(tx, {
      tabla: 'Solicitud',
      filaId: creada.id,
      sedeId: cancha.sedeId,
      usuarioId: entrada.usuarioId,
    });
    return {
      id: creada.id,
      usuarioId: creada.usuarioId,
      canchaId: creada.canchaId,
      sedeId: cancha.sedeId,
      fecha: creada.fecha,
      horaInicio: creada.horaInicio,
      horaFin: creada.horaFin,
      estado: 'PENDIENTE',
      intento: creada.intento,
      montoTotalCentavos: creada.montoTotalCentavos,
      limiteHold: creada.limiteHold!.toISOString(),
      creadoEn: creada.creadoEn.toISOString(),
    };
  } catch (error) {
    // Carrera que esquivó el chequeo de solape: el índice parcial la detiene.
    if (typeof error === 'object' && error !== null && (error as { code?: string }).code === 'P2002') {
      throw new HttpError(409, MENSAJE_HORARIO_OCUPADO);
    }
    throw error;
  }
}
