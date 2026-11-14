import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelTarifas } from '@/components/admin/PanelTarifas';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PanelTarifas', () => {
  it('oculta la gestión en modo lectura para el administrador', () => {
    render(
      <PanelTarifas
        iniciales={[{ id: 9, nombre: 'Alta', diasSemana: [1], horaInicio: '08:00', horaFin: '09:00', montoCentavos: 5000 }]}
        sedeId="7"
        horario={{ apertura: '08:00', cierre: '22:00' }}
        soloLectura
      />,
    );
    expect(screen.queryByRole('button', { name: 'Crear tarifa' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
  });

  it('rechaza un horario fuera de la sede antes de llamar al API', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PanelTarifas
        iniciales={[{ id: 9, nombre: 'Alta', diasSemana: [1], horaInicio: '08:00', horaFin: '09:00', montoCentavos: 5000 }]}
        sedeId="7"
        horario={{ apertura: '08:00', cierre: '22:00' }}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getAllByLabelText('Desde')[1], { target: { value: '06:00' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect(await screen.findByText(/dentro del horario de la sede/i)).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('abre la edición y guarda los cambios', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          tarifas: [{ id: 9, nombre: 'Alta Plus', diasSemana: [1], horaInicio: '08:00', horaFin: '09:00', montoCentavos: 6000 }],
        }),
      });
    vi.stubGlobal('fetch', fetchMock);
    render(
      <PanelTarifas
        iniciales={[{ id: 9, nombre: 'Alta', diasSemana: [1], horaInicio: '08:00', horaFin: '09:00', montoCentavos: 5000 }]}
        sedeId="7"
        horario={{ apertura: '08:00', cierre: '22:00' }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    fireEvent.change(screen.getAllByLabelText('Nombre')[1], { target: { value: 'Alta Plus' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Tarifa actualizada correctamente.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/tarifas/9',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
