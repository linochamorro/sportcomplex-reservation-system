import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelUsuarios } from '@/components/admin/PanelUsuarios';

describe('PanelUsuarios', () => {
  it('muestra administradores y superadmin, sin clientes', () => {
    render(
      <PanelUsuarios
        iniciales={[
          { id: 1, email: 'super@prueba.local', nombre: 'Super', rol: 'SUPERADMIN', sedeId: null },
          { id: 2, email: 'admin@prueba.local', nombre: 'Admin', rol: 'ADMIN', sedeId: 7 },
          { id: 3, email: 'cliente@prueba.local', nombre: 'Cliente', rol: 'USUARIO', sedeId: null },
        ]}
        sedes={[{ id: 7, nombre: 'Norte' }]}
      />,
    );
    expect(screen.getByText('Super')).toBeInTheDocument();
    expect(screen.getByText('Admin')).toBeInTheDocument();
    expect(screen.queryByText('Cliente')).not.toBeInTheDocument();
  });
});
