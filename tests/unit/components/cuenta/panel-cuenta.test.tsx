import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PanelCuenta } from '@/components/cuenta/PanelCuenta';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PanelCuenta', () => {
  it('guarda el perfil y valida la confirmación de la clave', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ email: 'cuenta@prueba.local', nombre: 'Cuenta Nueva', telefono: '999', rol: 'USUARIO', sedeNombre: null }),
    });
    vi.stubGlobal('fetch', fetchMock);
    render(<PanelCuenta inicial={{ email: 'cuenta@prueba.local', nombre: 'Cuenta', telefono: null, rol: 'USUARIO', sedeNombre: null }} />);

    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Cuenta Nueva' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }));
    expect(await screen.findByText('Cuenta actualizada correctamente.')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/cuenta/perfil',
      expect.objectContaining({ method: 'PUT' }),
    );

    fireEvent.click(screen.getByRole('button', { name: /^cambiar clave$/i }));
    fireEvent.change(screen.getByLabelText(/clave actual/i), { target: { value: 'Actual_99' } });
    fireEvent.change(screen.getByLabelText(/^nueva clave/i), { target: { value: 'Nueva_Clave_99' } });
    fireEvent.change(screen.getByLabelText(/confirmar nueva clave/i), { target: { value: 'Otra_Clave_99' } });
    fireEvent.click(screen.getByRole('button', { name: /guardar nueva clave/i }));
    expect(await screen.findByText('La confirmación no coincide con la nueva clave')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
