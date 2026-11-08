import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ListaReservas } from '@/components/reservas/ListaReservas';
import { MOTIVO_LIBERADA_POR_VENCIMIENTO } from '@/lib/domain/turnos';

describe('ListaReservas', () => {
  it('muestra estado, fecha, hora y costo', () => {
    render(
      <ListaReservas
        reservas={[
          {
            id: 1,
            canchaNombre: 'A1',
            fecha: '2026-09-28',
            horaInicio: '10:00',
            horaFin: '11:00',
            estado: 'CONFIRMADA',
            montoTotalCentavos: 5000,
            motivo: null,
            limiteHold: null,
          },
        ]}
      />,
    );
    expect(screen.getByText(/A1 · 2026-09-28 · 10:00–11:00/)).toBeInTheDocument();
    expect(screen.getByText(/S\/\s?50/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /confirmada/i })).toBeInTheDocument();
  });

  it('la pendiente explica el plazo de 3 horas', () => {
    render(
      <ListaReservas
        reservas={[
          {
            id: 2,
            canchaNombre: 'A1',
            fecha: '2026-09-30',
            horaInicio: '08:00',
            horaFin: '09:00',
            estado: 'PENDIENTE',
            montoTotalCentavos: 5000,
            motivo: null,
            limiteHold: new Date(Date.now() + 3_600_000).toISOString(),
          },
        ]}
      />,
    );
    expect(screen.getByText(/3 horas para confirmar/i)).toBeInTheDocument();
    // Uno en el texto de la fila y otro en la insignia de estado.
    expect(screen.getAllByRole('timer').length).toBe(2);
  });

  it('la liberada por vencimiento explica que administración no confirmó', () => {
    render(
      <ListaReservas
        reservas={[
          {
            id: 3,
            canchaNombre: 'A1',
            fecha: '2026-09-30',
            horaInicio: '08:00',
            horaFin: '09:00',
            estado: 'LIBERADA',
            montoTotalCentavos: 5000,
            motivo: MOTIVO_LIBERADA_POR_VENCIMIENTO,
            limiteHold: null,
          },
        ]}
      />,
    );
    expect(screen.getAllByText(/la administración no confirmó la reserva/i).length).toBeGreaterThan(0);
  });
});
