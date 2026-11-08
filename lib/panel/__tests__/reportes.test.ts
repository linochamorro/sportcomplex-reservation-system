import { describe, expect, it } from 'vitest';
import {
  calcularClientes,
  calcularEstados,
  calcularIngresos,
  calcularOcupacion,
  reporteACsv,
  type FilaReporte,
} from '@/lib/panel/reportes';

const FILAS: FilaReporte[] = [
  { sedeId: 1, sede: 'E2E_QA', canchaId: 11, cancha: 'QA-C01', fecha: '2026-08-12', horaInicio: '10:00', estado: 'CONFIRMADA', montoTotalCentavos: 5000, usuarioId: 7, usuarioNombre: 'QA Usuario', usuarioEmail: 'test-user@gmail.com' },
  { sedeId: 1, sede: 'E2E_QA', canchaId: 11, cancha: 'QA-C01', fecha: '2026-08-12', horaInicio: '19:00', estado: 'CONFIRMADA', montoTotalCentavos: 7000, usuarioId: 7, usuarioNombre: 'QA Usuario', usuarioEmail: 'test-user@gmail.com' },
  { sedeId: 1, sede: 'E2E_QA', canchaId: 12, cancha: 'QA-C02', fecha: '2026-08-12', horaInicio: '11:00', estado: 'PENDIENTE', montoTotalCentavos: 5000, usuarioId: 7, usuarioNombre: 'QA Usuario', usuarioEmail: 'test-user@gmail.com' },
  { sedeId: 1, sede: 'E2E_QA', canchaId: 12, cancha: 'QA-C02', fecha: '2026-08-12', horaInicio: '12:00', estado: 'RECHAZADA', montoTotalCentavos: 5000, usuarioId: 7, usuarioNombre: 'QA Usuario', usuarioEmail: 'test-user@gmail.com' },
  { sedeId: 1, sede: 'E2E_QA', canchaId: 11, cancha: 'QA-C01', fecha: '2026-08-13', horaInicio: '10:00', estado: 'CONFIRMADA', montoTotalCentavos: 7000, usuarioId: 7, usuarioNombre: 'QA Usuario', usuarioEmail: 'test-user@gmail.com' },
  { sedeId: 1, sede: 'E2E_QA', canchaId: 11, cancha: 'QA-C01', fecha: '2026-08-13', horaInicio: '18:00', estado: 'NO_SHOW', montoTotalCentavos: 5000, usuarioId: 7, usuarioNombre: 'QA Usuario', usuarioEmail: 'test-user@gmail.com' },
  { sedeId: 1, sede: 'E2E_QA', canchaId: 12, cancha: 'QA-C02', fecha: '2026-08-13', horaInicio: '09:00', estado: 'CANCELADA', montoTotalCentavos: 7000, usuarioId: 7, usuarioNombre: 'QA Usuario', usuarioEmail: 'test-user@gmail.com' },
];

describe('reportes de uso', () => {
  it('ocupación agrupa por turno y solo cuenta uso real', () => {
    const ocupacion = calcularOcupacion(FILAS);
    expect(ocupacion).toHaveLength(5);
    expect(ocupacion[0]).toMatchObject({ cancha: 'QA-C01', fecha: '2026-08-12', horaInicio: '10:00', reservas: 1, ingresosCentavos: 5000 });
  });

  it('ingresos solo suman CONFIRMADA por sede y cancha', () => {
    const { porSede, porCancha } = calcularIngresos(FILAS);
    expect(porSede).toHaveLength(1);
    expect(porSede[0]).toMatchObject({ sede: 'E2E_QA', confirmadas: 3, ingresosCentavos: 19000, ticketPromedioCentavos: 6333 });
    expect(porCancha[0]).toMatchObject({ cancha: 'QA-C01', confirmadas: 3, ingresosCentavos: 19000 });
  });

  it('estados reporta conteos y tasas por sede', () => {
    const { filas, total } = calcularEstados(FILAS);
    expect(total).toBe(7);
    expect(filas.find((f) => f.estado === 'CONFIRMADA')).toMatchObject({ total: 3, tasa: 3 / 7 });
  });

  it('clientes arma top y horas pico', () => {
    const { top, horasPico } = calcularClientes(FILAS);
    expect(top).toHaveLength(1);
    expect(top[0]).toMatchObject({ reservas: 7, confirmadas: 3, ingresosCentavos: 19000 });
    expect(horasPico[0]).toMatchObject({ horaInicio: '10:00', reservas: 2 });
  });

  it('CSV usa punto y coma con BOM y escapa comillas', () => {
    const csv = reporteACsv('ingresos', calcularIngresos(FILAS));
    expect(csv.startsWith('﻿nivel;nombre;sede;confirmadas;ingresos_centavos;ticket_promedio_centavos')).toBe(true);
    expect(csv).toContain('sede;E2E_QA;E2E_QA;3;19000;6333');
  });
});
