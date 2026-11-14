/**
 * Reloj de Lima (America/Lima, UTC−05:00 fijo, sin DST) como funciones puras.
 * Sin dependencias de sesión ni de base de datos: se usa en servidor y en
 * componentes de cliente. `lib/domain/turnos.ts` reutiliza el mismo offset,
 * de modo que la fecha que ve el usuario y la que valida el backend coinciden.
 */

export const LIMA_OFFSET_MINUTOS = -300;

/** Margen mínimo para solicitar un turno (el backend aplica el mismo). */
export const CORTE_RESERVA_MINUTOS = 15;

const FORMATO_FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const FORMATO_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Desplaza un instante a la hora de pared de Lima. */
export function aHoraDeLima(instante: Date): Date {
  return new Date(instante.getTime() + LIMA_OFFSET_MINUTOS * 60_000);
}

/** Fecha AAAA-MM-DD en Lima (no en UTC: a las 19:00 ya es el día siguiente). */
export function fechaEnLima(instante: Date = new Date()): string {
  return aHoraDeLima(instante).toISOString().slice(0, 10);
}

/** Mes AAAA-MM en Lima. */
export function mesEnLima(instante: Date = new Date()): string {
  return fechaEnLima(instante).slice(0, 7);
}

/** Fecha + hora de pared de Lima → instante UTC. */
export function inicioEnLimaAUtc(fecha: string, horaInicio: string): Date {
  const partesFecha = typeof fecha === 'string' ? fecha.match(FORMATO_FECHA) : null;
  const partesHora = typeof horaInicio === 'string' ? horaInicio.match(FORMATO_HORA) : null;
  if (!partesFecha) throw new Error('La fecha debe tener el formato AAAA-MM-DD');
  if (!partesHora) throw new Error('La hora de inicio debe tener el formato HH:mm');
  const [anio, mes, dia] = [Number(partesFecha[1]), Number(partesFecha[2]), Number(partesFecha[3])];
  const [hora, minuto] = [Number(partesHora[1]), Number(partesHora[2])];
  const calendario = new Date(Date.UTC(anio, mes - 1, dia, hora, minuto));
  if (
    calendario.getUTCFullYear() !== anio ||
    calendario.getUTCMonth() !== mes - 1 ||
    calendario.getUTCDate() !== dia
  ) {
    throw new Error('La fecha debe tener el formato AAAA-MM-DD');
  }
  return new Date(calendario.getTime() - LIMA_OFFSET_MINUTOS * 60_000);
}

/** ¿La hora está en punto (HH:00)? */
export function horaEnPunto(hora: string): boolean {
  const partes = typeof hora === 'string' ? hora.match(FORMATO_HORA) : null;
  return partes !== null && Number(partes[2]) === 0;
}

/** Minutos que faltan para el inicio del turno (negativo si ya pasó). */
export function minutosPara(fecha: string, horaInicio: string, ahora: Date = new Date()): number {
  return (inicioEnLimaAUtc(fecha, horaInicio).getTime() - ahora.getTime()) / 60_000;
}
