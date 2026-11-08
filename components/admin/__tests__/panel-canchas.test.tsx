import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelCanchas } from '@/components/admin/PanelCanchas';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PanelCanchas', () => {
  it('oculta la gestión en modo lectura para el administrador', () => {
    render(
      <PanelCanchas
        iniciales={[{ id: 11, nombre: 'A1', tarifaBaseCentavos: 5000, estado: 'DISPONIBLE', motivoNoDisponible: null }]}
        tarifas={[]}
        sedeId="7"
        soloLectura
      />,
    );
    expect(screen.queryByRole('button', { name: 'Crear cancha' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });

  it('elimina una cancha sin turnos futuros', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ cancha: { id: 11 }, turnos: [], alternativas: [] }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ canchas: [] }) });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PanelCanchas
        iniciales={[{ id: 11, nombre: 'A1', tarifaBaseCentavos: 5000, estado: 'DISPONIBLE', motivoNoDisponible: null }]}
        tarifas={[]}
        sedeId="7"
      />,
    );
    fireEvent.click(screen.getAllByRole('button', { name: 'Eliminar' })[0]);
    fireEvent.click(await screen.findByRole('button', { name: 'Eliminar cancha' }));
    expect(await screen.findByText('Cancha eliminada correctamente.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, '/api/canchas/11', expect.objectContaining({ method: 'DELETE' }));
  });

  it('oculta el costo sin disponibilidad y guarda la edición', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          canchas: [{ id: 11, nombre: 'A1', tarifaBaseCentavos: 5000, estado: 'DISPONIBLE', motivoNoDisponible: null }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PanelCanchas
        iniciales={[{ id: 11, nombre: 'A1', tarifaBaseCentavos: 5000, estado: 'NO_DISPONIBLE', motivoNoDisponible: 'Mantenimiento' }]}
        tarifas={[{ id: 9, nombre: 'Alta', diasSemana: [1], horaInicio: '08:00', horaFin: '09:00', montoCentavos: 6000 }]}
        sedeId="7"
      />,
    );

    expect(screen.getByText('Mantenimiento')).toBeInTheDocument();
    expect(screen.queryByText(/S\/\s?50/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'DISPONIBLE' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Cancha actualizada correctamente.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/canchas/11',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
