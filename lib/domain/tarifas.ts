import { HttpError } from '../auth/sesion';
import { minutosDe } from './turnos';

export function validarHorarioEnSede(horaInicio: string, horaFin: string, apertura: string, cierre: string): void {
  const inicio = minutosDe(horaInicio);
  const fin = minutosDe(horaFin);
  const abre = minutosDe(apertura);
  const cierra = minutosDe(cierre);
  if (!(inicio < fin)) throw new HttpError(400, 'Datos inválidos');
  if (!(abre <= inicio && fin <= cierra)) {
    throw new HttpError(400, `El horario debe estar dentro del horario de la sede (${apertura}–${cierre})`);
  }
}
