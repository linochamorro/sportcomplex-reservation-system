import { HttpError } from '../auth/sesion';

// Máquina de estados de verificación (B-03). Transiciones válidas desde el
// estado actual; cualquier otra es 409.

export const MOTIVO_MAX = 500;
export const MENSAJE_MOTIVO_REQUERIDO = 'El motivo de rechazo es obligatorio';
export const MENSAJE_MOTIVO_LARGO = 'El motivo no puede superar los 500 caracteres';
export const MENSAJE_TRANSICION_INVALIDA = 'La solicitud no permite esa acción en su estado actual';

export type EstadoSolicitud =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'RECHAZADA'
  | 'LIBERADA'
  | 'CANCELADA'
  | 'NO_SHOW';

export type AccionVerificacion = 'confirmar' | 'rechazar' | 'no_show';

const TRANSICIONES: Record<AccionVerificacion, { desde: EstadoSolicitud[]; hacia: EstadoSolicitud }> = {
  confirmar: { desde: ['PENDIENTE'], hacia: 'CONFIRMADA' },
  rechazar: { desde: ['PENDIENTE'], hacia: 'RECHAZADA' },
  no_show: { desde: ['CONFIRMADA'], hacia: 'NO_SHOW' },
};

export function puedeTransicionar(estado: EstadoSolicitud, accion: AccionVerificacion): boolean {
  return TRANSICIONES[accion].desde.includes(estado);
}

export function transicionarSolicitud(estado: EstadoSolicitud, accion: AccionVerificacion): EstadoSolicitud {
  if (!puedeTransicionar(estado, accion)) throw new HttpError(409, MENSAJE_TRANSICION_INVALIDA);
  return TRANSICIONES[accion].hacia;
}

/** Motivo obligatorio en rechazo: trim, 1–500. */
export function validarMotivoRechazo(motivo: unknown): string {
  const texto = typeof motivo === 'string' ? motivo.trim() : '';
  if (texto.length === 0) throw new HttpError(400, MENSAJE_MOTIVO_REQUERIDO);
  if (texto.length > MOTIVO_MAX) throw new HttpError(400, MENSAJE_MOTIVO_LARGO);
  return texto;
}
