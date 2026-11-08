import { describe, expect, it } from 'vitest';
import {
  CORTE_RESERVA_MINUTOS,
  aHoraDeLima,
  fechaEnLima,
  horaEnPunto,
  inicioEnLimaAUtc,
  mesEnLima,
  minutosPara,
} from '../reloj-lima';

describe('reloj de Lima', () => {
  it('la fecha usa el día de Lima, no el de UTC', () => {
    // 2026-09-30 20:12 en Lima = 2026-10-01T01:12Z (día siguiente en UTC).
    const instante = new Date('2026-10-01T01:12:00.000Z');
    expect(instante.toISOString().slice(0, 10)).toBe('2026-10-01');
    expect(fechaEnLima(instante)).toBe('2026-09-30');
    expect(mesEnLima(instante)).toBe('2026-09');
  });

  it('aHoraDeLima suma el desplazamiento fijo', () => {
    expect(aHoraDeLima(new Date('2026-10-01T01:12:00.000Z')).toISOString()).toBe('2026-09-30T20:12:00.000Z');
  });

  it('convierte hora de pared de Lima a UTC', () => {
    expect(inicioEnLimaAUtc('2026-09-30', '20:00').toISOString()).toBe('2026-10-01T01:00:00.000Z');
    expect(inicioEnLimaAUtc('2026-09-30', '08:00').toISOString()).toBe('2026-09-30T13:00:00.000Z');
  });

  it('rechaza fecha u hora mal formadas', () => {
    expect(() => inicioEnLimaAUtc('2026-13-01', '10:00')).toThrow();
    expect(() => inicioEnLimaAUtc('2026-02-30', '10:00')).toThrow();
    expect(() => inicioEnLimaAUtc('2026-09-30', '25:00')).toThrow();
  });

  it('horaEnPunto solo acepta HH:00', () => {
    expect(horaEnPunto('08:00')).toBe(true);
    expect(horaEnPunto('20:00')).toBe(true);
    expect(horaEnPunto('20:20')).toBe(false);
    expect(horaEnPunto('08:30')).toBe(false);
    expect(horaEnPunto('8:00')).toBe(false);
  });

  it('minutosPara cuenta contra el instante real', () => {
    const ahora = new Date('2026-10-01T01:12:00.000Z'); // 20:12 en Lima.
    // Turno 20:00 ya pasó; 20:20 no está en punto pero faltan 8 min.
    expect(minutosPara('2026-09-30', '20:00', ahora)).toBe(-12);
    expect(minutosPara('2026-09-30', '20:20', ahora)).toBe(8);
    expect(minutosPara('2026-09-30', '21:00', ahora)).toBe(48);
    expect(CORTE_RESERVA_MINUTOS).toBe(15);
  });
});
