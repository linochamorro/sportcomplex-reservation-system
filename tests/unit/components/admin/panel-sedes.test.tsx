import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelSedes } from '@/components/admin/PanelSedes';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PanelSedes', () => {
  it('precarga la sede y guarda los cambios', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sedes: [{ id: 7, nombre: 'Norte', direccion: 'Av. 1', apertura: '08:00', cierre: '22:00' }] }),
      });
    vi.stubGlobal('fetch', fetchMock);
    render(<PanelSedes iniciales={[{ id: 7, nombre: 'Norte', direccion: 'Av. 1', apertura: '08:00', cierre: '22:00' }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Editar' }));
    expect(screen.getByLabelText('Nombre')).toHaveValue('Norte');
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Norte Plus' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    expect(await screen.findByText('Sede actualizada correctamente.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/sedes/7',
      expect.objectContaining({ method: 'PUT' }),
    );
  });
});
