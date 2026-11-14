import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelBloqueos } from '@/components/bloqueos/PanelBloqueos';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PanelBloqueos', () => {
  it('ofrece las canchas disponibles y crea el mantenimiento', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ id: 5 }) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          bloqueos: [{ id: 5, canchaId: 11, fecha: '2026-09-28', horaInicio: '08:00', horaFin: '09:00', motivo: 'Limpieza' }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    render(<PanelBloqueos iniciales={[]} sedeId="7" canchas={[{ id: 11, nombre: 'A1' }]} />);
    fireEvent.change(screen.getByLabelText('Cancha'), { target: { value: '11' } });
    fireEvent.change(screen.getByLabelText('Fecha'), { target: { value: '2026-09-28' } });
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '08:00' } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '09:00' } });
    fireEvent.change(screen.getByLabelText('Motivo'), { target: { value: 'Limpieza' } });
    fireEvent.click(screen.getByRole('button', { name: 'Bloquear' }));
    expect(await screen.findByText('Cancha bloqueada correctamente.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/bloqueos',
      expect.objectContaining({
        method: 'POST',
        body: expect.stringContaining('"canchaId":11'),
      }),
    );
    expect(await screen.findAllByText('A1')).toHaveLength(2);
  });
});
