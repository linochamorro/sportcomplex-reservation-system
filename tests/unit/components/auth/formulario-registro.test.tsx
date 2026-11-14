import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { FormularioRegistro } from '@/components/auth/FormularioRegistro';

const reemplazar = vi.hoisted(() => vi.fn());
const refrescar = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: reemplazar, refresh: refrescar }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FormularioRegistro', () => {
  it('muestra el éxito e ingresa al aceptar', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true, creada: true }) })
      .mockResolvedValueOnce({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    render(<FormularioRegistro />);
    fireEvent.change(screen.getByLabelText(/nombre completo/i), { target: { value: 'Nueva Cuenta' } });
    fireEvent.change(screen.getByLabelText(/correo/i), { target: { value: 'nueva@prueba.local' } });
    fireEvent.change(screen.getByLabelText(/clave/i), { target: { value: 'Secreta_99' } });
    fireEvent.click(screen.getByRole('button', { name: /crear cuenta/i }));
    fireEvent.click(await screen.findByRole('button', { name: 'Aceptar' }));
    await waitFor(() => expect(reemplazar).toHaveBeenCalledWith('/'));
    expect(refrescar).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
