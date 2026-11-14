import { HttpError } from '../auth/sesion';
import {
  CORTE_RESERVA_MINUTOS,
  LIMA_OFFSET_MINUTOS,
  horaEnPunto,
  inicioEnLimaAUtc as inicioEnLimaAUtcCompartido,
} from '../ui/reloj-lima';

// Reglas de dominio puras (sin I/O) — B-02. El hold y la ventana se computan
// siempre contra reloj servidor (invariante 1 de docs/SYNC_INVARIANTES.md).

export const BLOQUE_MINUTOS = 60;
/** Plazo de confirmación de la administración antes de liberar la cancha: 3 h. */
export const HOLD_MINUTOS = 180;

/** Motivo interno (registro de la empresa) al liberar por falta de respuesta. */
export const MOTIVO_LIBERADA_POR_VENCIMIENTO = 'Se liberó la cancha por llegar al exceso de tiempo sin respuesta de la administración';
export const VENTANA_MINIMA_MINUTOS = 90;
export const MAX_INTENTOS = 2;

/** Desplazamiento fijo de America/Lima respecto a UTC (−05:00, sin DST). */
export { LIMA_OFFSET_MINUTOS, horaEnPunto };

export type EstadoSolicitudDominio =
  | 'PENDIENTE'
  | 'CONFIRMADA'
  | 'RECHAZADA'
  | 'LIBERADA'
  | 'CANCELADA'
  | 'NO_SHOW';

const ESTADOS_BLOQUEANTES: readonly EstadoSolicitudDominio[] = ['PENDIENTE', 'CONFIRMADA'];

export function estadoBloquea(estado: string): boolean {
  return (ESTADOS_BLOQUEANTES as readonly string[]).includes(estado);
}

const FORMATO_HORA = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** Igual que el reloj compartido, pero los fallos de formato son 400 de API. */
export function inicioEnLimaAUtc(fecha: string, horaInicio: string): Date {
  try {
    return inicioEnLimaAUtcCompartido(fecha, horaInicio);
  } catch (error) {
    throw new HttpError(400, error instanceof Error ? error.message : 'Datos inválidos');
  }
}

/** Fin del bloque de 60 min (cruza medianoche con módulo 24 h). */
export function derivarHoraFin(horaInicio: string): string {
  const partes = typeof horaInicio === 'string' ? horaInicio.match(FORMATO_HORA) : null;
  if (!partes) throw new HttpError(400, 'La hora de inicio debe tener el formato HH:mm');
  const total = Number(partes[1]) * 60 + Number(partes[2]) + BLOQUE_MINUTOS;
  const hora = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const minuto = String(total % 60).padStart(2, '0');
  return `${hora}:${minuto}`;
}

/** Minutos desde medianoche de una hora HH:mm. */
export function minutosDe(hora: string): number {
  const [h, m] = hora.split(':');
  return Number(h) * 60 + Number(m);
}

/**
 * El turno completo debe caber dentro del horario de atención: no antes de la
 * apertura ni después del cierre. Con apertura 07:00 y cierre 23:00, el último
 * turno reservable es 22:00 (22:00–23:00); 23:00–00:00 ya se saldría.
 * Un cierre de 23:59 se interpreta como medianoche (fin de día), de modo que el
 * bloque 23:00–00:00 sí es válido en una sede que cierra a medianoche.
 */
export function validarTurnoEnSede(horaInicio: string, horaFin: string, apertura: string, cierre: string): void {
  const inicio = minutosDe(horaInicio);
  const fin = minutosDe(horaFin);
  const abre = minutosDe(apertura);
  // 23:59 (o 24:00) significa "hasta la medianoche": el fin puede llegar a 1440.
  const cierra = cierre === '24:00' || cierre === '23:59' ? 24 * 60 : minutosDe(cierre);
  const finAbsoluto = fin <= inicio ? fin + 24 * 60 : fin;
  if (!(abre <= inicio && finAbsoluto <= cierra)) {
    throw new HttpError(
      400,
      `El turno debe caber en el horario de la sede (${apertura}–${cierre}); el ultimo turno termina a las ${cierra === 24 * 60 ? '00:00' : cierre}`,
    );
  }
}

/** Ventana mínima de envío (borde exacto permitido). Solo la usa la reasignación. */
export function validarVentana(inicioUtc: Date, ahora: Date): void {
  const diferenciaMinutos = (inicioUtc.getTime() - ahora.getTime()) / 60_000;
  if (diferenciaMinutos < VENTANA_MINIMA_MINUTOS) {
    throw new HttpError(
      400,
      'La solicitud debe enviarse hasta 1 hora y 30 minutos antes del inicio del horario',
    );
  }
}

/** Reglas de reserva: hora en punto, turno futuro y corte 15 min antes. */
export { CORTE_RESERVA_MINUTOS };

export function validarReserva(inicioUtc: Date, ahora: Date, horaInicio: string): void {
  if (!horaEnPunto(horaInicio)) {
    throw new HttpError(400, 'La reserva debe ser en hora en punto (ej. 17:00, 18:00)');
  }
  if (inicioUtc.getTime() <= ahora.getTime()) {
    throw new HttpError(400, 'El horario debe estar en el futuro');
  }
  if (ahora.getTime() > inicioUtc.getTime() - CORTE_RESERVA_MINUTOS * 60_000) {
    throw new HttpError(
      400,
      `La reserva debe hacerse hasta ${CORTE_RESERVA_MINUTOS} minutos antes del inicio del horario`,
    );
  }
}

/** Solape de rangos [inicio,fin) contemplando cruce de medianoche. */
export function rangosSolapan(
  inicioA: number,
  finA: number,
  inicioB: number,
  finB: number,
): boolean {
  const normalizar = (inicio: number, fin: number): Array<[number, number]> =>
    fin > inicio
      ? [[inicio, fin]]
      : [
          [inicio, 24 * 60],
          [0, fin],
        ];
  const partesA = normalizar(inicioA, finA);
  const partesB = normalizar(inicioB, finB);
  return partesA.some(([a0, a1]) => partesB.some(([b0, b1]) => a0 < b1 && b0 < a1));
}

export type FranjaPrecio = { horaInicio: string; horaFin: string; montoCentavos: number; diasSemana?: number[] };

/** Día de semana 0=domingo..6=sábado para una fecha AAAA-MM-DD. */
export function diaSemanaDe(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d)).getUTCDay();
}

/** Fechas [fecha-1, fecha, fecha+1]: una reserva puede cruzar la medianoche. */
export function fechasVecinas(fecha: string): string[] {
  const [a, m, d] = fecha.split('-').map(Number);
  const suma = (dias: number): string => {
    const base = new Date(Date.UTC(a, m - 1, d));
    base.setUTCDate(base.getUTCDate() + dias);
    return base.toISOString().slice(0, 10);
  };
  return [suma(-1), fecha, suma(1)];
}

function minutosAbsolutos(fecha: string, inicio: number, fin: number): [number, number] {
  const base = Date.UTC(
    Number(fecha.slice(0, 4)),
    Number(fecha.slice(5, 7)) - 1,
    Number(fecha.slice(8, 10)),
  );
  const finMin = fin > inicio ? fin : fin + 24 * 60;
  return [base + inicio * 60_000, base + finMin * 60_000];
}

/**
 * Solape entre dos reservas con fecha y rango horario, normalizando cada una a
 * instantes absolutos: una reserva que cruza medianoche se extiende al día
 * siguiente (`horaFin <= horaInicio` suma 24 h), de modo que el borde
 * `23:30→00:30` choca con `00:00` del día siguiente.
 */
export function solapanConFecha(
  fechaA: string,
  inicioA: number,
  finA: number,
  fechaB: string,
  inicioB: number,
  finB: number,
): boolean {
  const [a0, a1] = minutosAbsolutos(fechaA, inicioA, finA);
  const [b0, b1] = minutosAbsolutos(fechaB, inicioB, finB);
  return a0 < b1 && b0 < a1;
}

/**
 * Monto en centavos: la franja que contiene el slot REEMPLAZA la base
 * (precio absoluto, semiabierto inicio<=slot<fin); sin franja usa la base.
 * Si se pasa `fecha`, la franja también debe cubrir ese día de semana
 * (las franjas sin diasSemana siguen aplicando como antes).
 */
export function calcularMontoCentavos(parametros: {
  horaInicio: string;
  tarifaBaseCentavos: number;
  tarifas: FranjaPrecio[];
  fecha?: string;
}): number {
  const minutoSlot = minutosDe(parametros.horaInicio);
  const dow = parametros.fecha != null && /^\d{4}-\d{2}-\d{2}$/.test(parametros.fecha) ? diaSemanaDe(parametros.fecha) : null;
  const franja = parametros.tarifas.find((candidata) => {
    const inicio = minutosDe(candidata.horaInicio);
    const fin = minutosDe(candidata.horaFin);
    if (!(inicio <= minutoSlot && minutoSlot < fin)) return false;
    if (dow == null) return true;
    const dias = candidata.diasSemana;
    return !Array.isArray(dias) || dias.length === 0 || dias.includes(dow);
  });
  return franja === undefined ? parametros.tarifaBaseCentavos : franja.montoCentavos;
}
