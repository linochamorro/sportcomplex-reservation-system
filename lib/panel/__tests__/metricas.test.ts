import { describe, expect, it } from 'vitest';
import { calcularMetricas } from '@/lib/panel/metricas';

describe('métricas del panel', () => {
  it('calcula ingresos, ticket, tasa y destacados', () => {
    const metricas = calcularMetricas(
      [
        { estado: 'CONFIRMADA', montoTotalCentavos: 5000, sedeId: 1, sedeNombre: 'Norte', canchaId: 1, canchaNombre: 'A1' },
        { estado: 'CONFIRMADA', montoTotalCentavos: 7000, sedeId: 1, sedeNombre: 'Norte', canchaId: 1, canchaNombre: 'A1' },
        { estado: 'PENDIENTE', montoTotalCentavos: 5000, sedeId: 2, sedeNombre: 'Sur', canchaId: 2, canchaNombre: 'B1' },
        { estado: 'NO_SHOW', montoTotalCentavos: 5000, sedeId: 2, sedeNombre: 'Sur', canchaId: 2, canchaNombre: 'B1' },
      ],
      { sedes: 2, canchas: 2, usuarios: 5 },
    );
    expect(metricas.confirmadas).toBe(2);
    expect(metricas.pendientes).toBe(1);
    expect(metricas.noShow).toBe(1);
    expect(metricas.ingresosCentavos).toBe(12000);
    expect(metricas.ticketPromedioCentavos).toBe(6000);
    expect(metricas.tasaConfirmacion).toBeCloseTo(2 / 3, 5);
    expect(metricas.topSedes[0]).toMatchObject({ sede: 'Norte', confirmadas: 2 });
    expect(metricas.topCanchas[0]).toMatchObject({ cancha: 'A1', confirmadas: 2 });
  });
});
