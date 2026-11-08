import { describe, expect, it } from 'vitest';
import { validarHorarioEnSede } from '@/lib/domain/tarifas';

describe('horario de tarifas', () => {
  it('acepta rangos dentro del horario de la sede y rechaza los externos', () => {
    expect(() => validarHorarioEnSede('08:00', '09:00', '08:00', '22:00')).not.toThrow();
    expect(() => validarHorarioEnSede('06:00', '07:00', '08:00', '22:00')).toThrowError('dentro del horario de la sede');
    expect(() => validarHorarioEnSede('09:00', '09:00', '08:00', '22:00')).toThrowError('Datos inválidos');
  });
});
