import { HttpError } from '../auth/sesion';
import { minutosDe, solapanConFecha } from './turnos';
import type { EstadoSolicitud } from './verificacion';

// Dominio de bloqueos (B-03). Un bloqueo afecta a las reservas que solapan su
// rango (incluido cruce de medianoche) y clasifica su disposición.

export const MENSAJE_BLOQUEO_MOTIVO_REQUERIDO = 'El motivo del bloqueo es obligatorio';
export const MENSAJE_BLOQUEO_HORAS_INVALIDAS = 'El rango del bloqueo no es válido';

export type DisposicionAfectada =
  | 'CANCELAR_SIN_REEMBOLSO'
  | 'REQUIERE_DECISION'
  | 'NO_AFECTADA';

export function clasificarAfectada(estado: EstadoSolicitud): DisposicionAfectada {
  if (estado === 'PENDIENTE') return 'CANCELAR_SIN_REEMBOLSO';
  if (estado === 'CONFIRMADA') return 'REQUIERE_DECISION';
  return 'NO_AFECTADA';
}

type Rango = { fecha: string; horaInicio: string; horaFin: string };

export function bloqueoAfectaSolicitud(bloqueo: Rango, solicitud: Rango): boolean {
  return solapanConFecha(
    bloqueo.fecha,
    minutosDe(bloqueo.horaInicio),
    minutosDe(bloqueo.horaFin),
    solicitud.fecha,
    minutosDe(solicitud.horaInicio),
    minutosDe(solicitud.horaFin),
  );
}

/** Valida la entrada de un bloqueo: motivo 1–500 y rango HH:mm coherente. */
export function validarBloqueo(entrada: {
  motivo?: unknown;
  horaInicio?: unknown;
  horaFin?: unknown;
}): { motivo: string; horaInicio: string; horaFin: string } {
  const motivo = typeof entrada.motivo === 'string' ? entrada.motivo.trim() : '';
  if (motivo.length === 0 || motivo.length > 500) {
    throw new HttpError(400, MENSAJE_BLOQUEO_MOTIVO_REQUERIDO);
  }
  const hora = /^([01]\d|2[0-3]):([0-5]\d)$/;
  if (typeof entrada.horaInicio !== 'string' || typeof entrada.horaFin !== 'string') {
    throw new HttpError(400, MENSAJE_BLOQUEO_HORAS_INVALIDAS);
  }
  if (!hora.test(entrada.horaInicio) || !hora.test(entrada.horaFin)) {
    throw new HttpError(400, MENSAJE_BLOQUEO_HORAS_INVALIDAS);
  }
  return { motivo, horaInicio: entrada.horaInicio, horaFin: entrada.horaFin };
}
