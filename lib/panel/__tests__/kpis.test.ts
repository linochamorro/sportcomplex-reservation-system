import { describe, expect, it } from 'vitest';
import { calcularKpis } from '@/lib/panel/kpis';

describe('kpis mensuales', () => {
  it('calcula ingresos diarios, mensuales, por cancha y usuarios activos', () => {
    const kpis = calcularKpis(
      [
        { canchaId: 1, canchaNombre: 'A1', fecha: '2026-09-27', estado: 'CONFIRMADA', montoTotalCentavos: 5000, usuarioId: 3 },
        { canchaId: 1, canchaNombre: 'A1', fecha: '2026-09-27', estado: 'PENDIENTE', montoTotalCentavos: 5000, usuarioId: 3 },
        { canchaId: 2, canchaNombre: 'A2', fecha: '2026-09-10', estado: 'CONFIRMADA', montoTotalCentavos: 7000, usuarioId: 4 },
      ],
      '2026-09-27',
      '2026-09',
      null,
    );
    expect(kpis.ingresoDiarioCentavos).toBe(5000);
    expect(kpis.ingresoMensualCentavos).toBe(12000);
    expect(kpis.confirmadasMensuales).toBe(2);
    expect(kpis.ticketPromedioMensualCentavos).toBe(6000);
    expect(kpis.usuariosActivosMensuales).toBe(2);
    expect(kpis.porCancha[0]).toMatchObject({ cancha: 'A2', ingresoMensualCentavos: 7000 });
  });
});
