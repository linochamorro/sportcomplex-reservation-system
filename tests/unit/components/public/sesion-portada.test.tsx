import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AccesosPortada, AccionesPortada, ProveedorSesionPortada } from '@/components/public/SesionPortada';

const reemplazar = vi.hoisted(() => vi.fn());
const refrescar = vi.hoisted(() => vi.fn());

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: reemplazar, refresh: refrescar }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('sesión en la portada', () => {
  it('muestra los accesos públicos sin sesión', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
    render(
      <ProveedorSesionPortada>
        <AccesosPortada />
      </ProveedorSesionPortada>,
    );
    expect(await screen.findByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro');
  });

  it('muestra el menú de la cuenta y acciones por rol', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ nombre: 'Lino', rol: 'SUPERADMIN' }) }),
    );
    render(
      <ProveedorSesionPortada>
        <AccesosPortada />
        <AccionesPortada />
      </ProveedorSesionPortada>,
    );
    const boton = await screen.findByRole('button', { name: /lino/i });
    fireEvent.click(boton);
    expect(screen.getByRole('menuitem', { name: 'Configuración' })).toHaveAttribute('href', '/configuracion');
    expect(screen.getByRole('menuitem', { name: 'Mi cuenta' })).toHaveAttribute('href', '/mi-cuenta');
    expect(screen.getByRole('menuitem', { name: 'Cerrar sesión' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Abrir configuración' })).toHaveAttribute('href', '/configuracion');
  });
});
