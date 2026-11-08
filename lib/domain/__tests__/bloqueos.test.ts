import { describe, expect, it } from 'vitest';
import {
  bloqueoAfectaSolicitud,
  clasificarAfectada,
} from '../bloqueos';

describe('bloqueos: clasificación de afectadas (B-03/AC-03)', () => {
  it('PENDIENTE se cancela sin reembolso; CONFIRMADA exige decisión', () => {
    expect(clasificarAfectada('PENDIENTE')).toBe('CANCELAR_SIN_REEMBOLSO');
    expect(clasificarAfectada('CONFIRMADA')).toBe('REQUIERE_DECISION');
    expect(clasificarAfectada('RECHAZADA')).toBe('NO_AFECTADA');
    expect(clasificarAfectada('LIBERADA')).toBe('NO_AFECTADA');
    expect(clasificarAfectada('CANCELADA')).toBe('NO_AFECTADA');
    expect(clasificarAfectada('NO_SHOW')).toBe('NO_AFECTADA');
  });

  it('bloqueoAfectaSolicitud detecta solape cross-midnight', () => {
    // Bloqueo 23:30→00:30 del 10 choca con solicitud 00:00 del 11.
    expect(
      bloqueoAfectaSolicitud(
        { fecha: '2027-02-10', horaInicio: '23:30', horaFin: '00:30' },
        { fecha: '2027-02-11', horaInicio: '00:00', horaFin: '01:00' },
      ),
    ).toBe(true);
    // Sin solape.
    expect(
      bloqueoAfectaSolicitud(
        { fecha: '2027-02-10', horaInicio: '08:00', horaFin: '09:00' },
        { fecha: '2027-02-10', horaInicio: '10:00', horaFin: '11:00' },
      ),
    ).toBe(false);
  });
});
