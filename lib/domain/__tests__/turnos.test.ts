import { describe, expect, it } from 'vitest';
import {
  BLOQUE_MINUTOS,
  CORTE_RESERVA_MINUTOS,
  HOLD_MINUTOS,
  MAX_INTENTOS,
  MOTIVO_LIBERADA_POR_VENCIMIENTO,
  VENTANA_MINIMA_MINUTOS,
  calcularMontoCentavos,
  derivarHoraFin,
  estadoBloquea,
  fechasVecinas,
  inicioEnLimaAUtc,
  minutosDe,
  rangosSolapan,
  solapanConFecha,
  validarReserva,
  validarTurnoEnSede,
  validarVentana,
} from '../turnos';

describe('turnos: relojes y ventana (B-02/AC-01)', () => {
  it('Lima es UTC-05:00 fijo: 20:00 Lima = 01:00 UTC del día siguiente', () => {
    expect(inicioEnLimaAUtc('2026-10-01', '20:00').toISOString()).toBe('2026-10-02T01:00:00.000Z');
  });

  it('rechaza fecha u hora mal formadas', () => {
    expect(() => inicioEnLimaAUtc('2026-13-01', '10:00')).toThrow();
    expect(() => inicioEnLimaAUtc('2026-10-01', '25:00')).toThrow();
    expect(() => inicioEnLimaAUtc('2026-02-30', '10:00')).toThrow();
  });

  it('deriva el fin +60 min cruzando medianoche', () => {
    expect(derivarHoraFin('23:30')).toBe('00:30');
    expect(derivarHoraFin('08:00')).toBe('09:00');
    expect(derivarHoraFin('23:00')).toBe('00:00');
    expect(() => derivarHoraFin('7:00')).toThrow();
  });

  it('ventana mínima 90 min: borde permitido, menos rechazado (reasignación)', () => {
    const inicio = new Date('2026-10-01T12:00:00.000Z');
    const borde = new Date(inicio.getTime() - VENTANA_MINIMA_MINUTOS * 60_000);
    expect(() => validarVentana(inicio, borde)).not.toThrow();
    expect(() => validarVentana(inicio, new Date(borde.getTime() + 60_000))).toThrow();
  });

  it('validarReserva: hora en punto, futuro y corte 15 min', () => {
    const inicio = new Date('2026-10-01T12:00:00.000Z');
    const corte = new Date(inicio.getTime() - CORTE_RESERVA_MINUTOS * 60_000);
    expect(() => validarReserva(inicio, corte, '12:00')).not.toThrow();
    expect(() => validarReserva(inicio, corte, '12:30')).toThrow(/hora en punto/);
    expect(() => validarReserva(inicio, new Date(corte.getTime() + 60_000), '12:00')).toThrow(/15 minutos/);
    expect(() => validarReserva(inicio, inicio, '12:00')).toThrow(/futuro/);
    expect(() => validarReserva(new Date(inicio.getTime() - 60_000), inicio, '12:00')).toThrow(/futuro/);
  });

  it('corte: rechaza a 10 y a 14 min, acepta a 15 y a 16 min', () => {
    // Turno 12:00 UTC = 07:00 en Lima.
    const inicio = new Date('2026-10-01T12:00:00.000Z');
    const aMin = (m: number) => new Date(inicio.getTime() - m * 60_000);
    expect(() => validarReserva(inicio, aMin(10), '12:00')).toThrow(/15 minutos antes/);
    expect(() => validarReserva(inicio, aMin(14), '12:00')).toThrow(/15 minutos antes/);
    expect(() => validarReserva(inicio, aMin(15), '12:00')).not.toThrow();
    expect(() => validarReserva(inicio, aMin(16), '12:00')).not.toThrow();
  });

  it('constantes de dominio', () => {
    expect(BLOQUE_MINUTOS).toBe(60);
    expect(HOLD_MINUTOS).toBe(180);
    expect(MAX_INTENTOS).toBe(2);
    expect(minutosDe('01:30')).toBe(90);
  });

  it('el motivo de liberación explica el exceso de tiempo', () => {
    expect(MOTIVO_LIBERADA_POR_VENCIMIENTO).toMatch(/exceso de tiempo sin respuesta/i);
    expect(MOTIVO_LIBERADA_POR_VENCIMIENTO).toMatch(/administraci[óo]n/i);
  });
});

describe('turnos: solape y estados (B-02/AC-03/04)', () => {
  it('solape en rango simple', () => {
    expect(rangosSolapan(minutosDe('08:00'), minutosDe('09:00'), minutosDe('08:30'), minutosDe('09:30'))).toBe(true);
    expect(rangosSolapan(minutosDe('08:00'), minutosDe('09:00'), minutosDe('09:00'), minutosDe('10:00'))).toBe(false);
  });

  it('solape de extremo a extremo del día (23:30→00:30)', () => {
    expect(rangosSolapan(minutosDe('23:30'), minutosDe('00:30'), minutosDe('00:00'), minutosDe('01:00'))).toBe(true);
    expect(rangosSolapan(minutosDe('00:00'), minutosDe('01:00'), minutosDe('23:00'), minutosDe('23:59'))).toBe(false);
  });

  it('solapanConFecha: cruce de medianoche choca entre días distintos (F-01)', () => {
    // 23:30 del día 15 → 00:30 del 16 solapa con 00:00 del 16.
    expect(solapanConFecha('2027-01-15', minutosDe('23:30'), minutosDe('00:30'), '2027-01-16', minutosDe('00:00'), minutosDe('01:00'))).toBe(true);
    // Simétrico inverso.
    expect(solapanConFecha('2027-01-16', minutosDe('00:00'), minutosDe('01:00'), '2027-01-15', minutosDe('23:30'), minutosDe('00:30'))).toBe(true);
    // Días lejanos no solapan aunque el rango horario coincida.
    expect(solapanConFecha('2027-01-15', minutosDe('23:30'), minutosDe('00:30'), '2027-01-17', minutosDe('00:00'), minutosDe('01:00'))).toBe(false);
  });

  it('fechasVecinas devuelve ±1 día', () => {
    expect(fechasVecinas('2027-01-15')).toEqual(['2027-01-14', '2027-01-15', '2027-01-16']);
    expect(fechasVecinas('2027-03-01')).toEqual(['2027-02-28', '2027-03-01', '2027-03-02']);
  });

  it('solo PENDIENTE y CONFIRMADA bloquean', () => {
    expect(estadoBloquea('PENDIENTE')).toBe(true);
    expect(estadoBloquea('CONFIRMADA')).toBe(true);
    expect(estadoBloquea('RECHAZADA')).toBe(false);
    expect(estadoBloquea('LIBERADA')).toBe(false);
    expect(estadoBloquea('CANCELADA')).toBe(false);
    expect(estadoBloquea('NO_SHOW')).toBe(false);
  });
});

describe('turnos: monto (B-02)', () => {
  const tarifas = [
    { horaInicio: '18:00', horaFin: '23:00', montoCentavos: 9000 },
    { horaInicio: '08:00', horaFin: '12:00', montoCentavos: 5000 },
  ];

  it('la franja reemplaza la base; sin franja usa la base', () => {
    expect(calcularMontoCentavos({ horaInicio: '19:00', tarifaBaseCentavos: 7000, tarifas })).toBe(9000);
    expect(calcularMontoCentavos({ horaInicio: '09:00', tarifaBaseCentavos: 7000, tarifas })).toBe(5000);
    expect(calcularMontoCentavos({ horaInicio: '15:00', tarifaBaseCentavos: 7000, tarifas })).toBe(7000);
  });

  it('franja semiabierta: inicio incluido, fin excluido', () => {
    expect(calcularMontoCentavos({ horaInicio: '18:00', tarifaBaseCentavos: 7000, tarifas })).toBe(9000);
    expect(calcularMontoCentavos({ horaInicio: '23:00', tarifaBaseCentavos: 7000, tarifas })).toBe(7000);
  });

  it('con fecha, la franja debe cubrir el día de semana', () => {
    const porDia = [
      { horaInicio: '07:00', horaFin: '18:00', montoCentavos: 3000, diasSemana: [1, 2, 3, 4] },
      { horaInicio: '07:00', horaFin: '18:00', montoCentavos: 5000, diasSemana: [0, 5, 6] },
    ];
    // 2027-01-04 lunes → 3000; 2027-01-03 domingo → 5000.
    expect(calcularMontoCentavos({ horaInicio: '10:00', tarifaBaseCentavos: 7000, tarifas: porDia, fecha: '2027-01-04' })).toBe(3000);
    expect(calcularMontoCentavos({ horaInicio: '10:00', tarifaBaseCentavos: 7000, tarifas: porDia, fecha: '2027-01-03' })).toBe(5000);
    // Sin fecha o sin diasSemana, manda la hora como antes.
    expect(calcularMontoCentavos({ horaInicio: '10:00', tarifaBaseCentavos: 7000, tarifas: porDia })).toBe(3000);
    expect(calcularMontoCentavos({ horaInicio: '10:00', tarifaBaseCentavos: 7000, tarifas, fecha: '2027-01-03' })).toBe(5000);
  });
});

describe('turnos: horario de sede (QA-01 / horario de atención)', () => {
  it('acepta el turno completo dentro del horario, bordes incluidos', () => {
    expect(() => validarTurnoEnSede('08:00', '09:00', '08:00', '22:00')).not.toThrow();
    expect(() => validarTurnoEnSede('21:00', '22:00', '08:00', '22:00')).not.toThrow();
  });

  it('rechaza antes de la apertura y después del cierre', () => {
    expect(() => validarTurnoEnSede('07:00', '08:00', '08:00', '22:00')).toThrow(/horario de la sede/);
    expect(() => validarTurnoEnSede('22:00', '23:00', '08:00', '22:00')).toThrow(/horario de la sede/);
  });

  it('el último turno reservable es el que termina justo en el cierre', () => {
    // Sede 07:00–23:00: el último turno es 22:00–23:00.
    expect(() => validarTurnoEnSede('22:00', '23:00', '07:00', '23:00')).not.toThrow();
    expect(() => validarTurnoEnSede('23:00', '00:00', '07:00', '23:00')).toThrow(/horario de la sede/);
    // Sede 08:00–22:00: el último turno es 21:00–22:00.
    expect(() => validarTurnoEnSede('21:00', '22:00', '08:00', '22:00')).not.toThrow();
    expect(() => validarTurnoEnSede('22:00', '23:00', '08:00', '22:00')).toThrow(/horario de la sede/);
  });

  it('un cierre de 23:59 significa medianoche y admite el bloque 23:00–00:00', () => {
    expect(() => validarTurnoEnSede('23:00', '00:00', '07:00', '23:59')).not.toThrow();
    expect(() => validarTurnoEnSede('23:30', '00:30', '07:00', '23:59')).toThrow(/horario de la sede/);
  });
});
