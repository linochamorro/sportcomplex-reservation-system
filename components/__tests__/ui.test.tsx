import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/configuracion',
}));

import { InsigniaEstado } from '@/components/estado/InsigniaEstado';
import { DESTINOS, NavegacionPorRol } from '@/components/layout/NavegacionPorRol';
import { GrillaDiaria } from '@/components/grilla/GrillaDiaria';
import { TiraKpis } from '@/components/kpis/TiraKpis';
import { Esqueleto } from '@/components/ui/Esqueleto';
import { BannerSesion } from '@/components/layout/BannerSesion';
import { IDS_ESTADO, ESTADOS } from '@/lib/design-tokens';
import { MOTIVO_LIBERADA_POR_VENCIMIENTO } from '@/lib/domain/turnos';

describe('kit UI (C-02/AC-05)', () => {
  it('InsigniaEstado cubre los 10 estados con etiqueta', () => {
    const { unmount } = render(
      <>
        {IDS_ESTADO.map((id) => (
          <InsigniaEstado key={id} estado={id} />
        ))}
      </>,
    );
    expect(screen.getAllByRole('img').length).toBe(10);
    // Íconos vectoriales: nada de marcadores de texto [Clock]/[LockOpen].
    expect(document.querySelectorAll('.insignia-estado svg').length).toBe(10);
    for (const insignia of document.querySelectorAll('.insignia-estado')) {
      expect(insignia.getAttribute('data-estado')).toBeTruthy();
      expect(insignia.getAttribute('aria-label')).toBeTruthy();
    }
    expect(document.body.textContent).not.toMatch(/\[(Clock|LockOpen|Check|X|Prohibit|Warning|Upload|Sync|GitFork|WifiOff)\]/);
    unmount();
  });

  it('InsigniaEstado traduce el motivo interno para el usuario', () => {
    const { unmount } = render(
      <>
        <InsigniaEstado estado="LIBERADA" motivo={MOTIVO_LIBERADA_POR_VENCIMIENTO} />
        <InsigniaEstado estado="LIBERADA" motivo={MOTIVO_LIBERADA_POR_VENCIMIENTO} interno />
      </>,
    );
    expect(screen.getAllByRole('img', { name: /la administración no confirmó la reserva/i }).length).toBe(1);
    expect(screen.getAllByRole('img', { name: /exceso de tiempo sin respuesta/i }).length).toBe(1);
    unmount();
  });

  it('InsigniaEstado nunca muestra un placeholder de cuenta atrás', () => {
    const { unmount } = render(
      <>
        <InsigniaEstado estado="PENDIENTE" />
        <InsigniaEstado estado="PENDIENTE" limiteHoldIso={new Date(Date.now() + 3_600_000).toISOString()} />
        <InsigniaEstado estado="PENDIENTE" cuentaAtras="59:41" />
      </>,
    );
    expect(document.body.textContent).not.toMatch(/mm:ss/);
    // Con hold conocido la cuenta atrás se cuenta en vivo dentro de la insignia.
    expect(screen.getAllByRole('timer').length).toBe(1);
    // Con el texto ya calculado, gana el texto recibido.
    expect(document.body.textContent).toContain('59:41');
    unmount();
  });

  it('NavegacionPorRol muestra destinos y contadores vivos', () => {
    render(<NavegacionPorRol rol="ADMIN" actual="/pendientes" pendientes={3} noLeidas={2} />);
    expect(screen.getAllByRole('navigation').length).toBe(2);
    expect(screen.getAllByText(/Pendientes \(3 pendientes\)/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/Notificaciones/)).not.toBeInTheDocument();
  });

  it('GrillaDiaria tabla con timer y estado vacío', () => {
    const { unmount } = render(
      <GrillaDiaria
        celdas={[{ canchaId: 1, cancha: 'C1', horaInicio: '10:00', horaFin: '11:00', estado: 'PENDIENTE', limiteHold: new Date(Date.now() + 60000).toISOString() }]}
      />,
    );
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('timer')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /confirmar/i })).not.toBeInTheDocument();
    unmount();
    render(<GrillaDiaria celdas={[]} />);
    expect(screen.getByRole('status')).toHaveTextContent(/sin reservas/i);
  });

  it('GrillaDiaria con puedeConfirmar confirma la pendiente', async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, json: async () => ({ estado: 'CONFIRMADA' }) }) as Response);
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(
        <GrillaDiaria
          puedeConfirmar
          celdas={[{ solicitudId: 5, canchaId: 1, cancha: 'C1', horaInicio: '10:00', horaFin: '11:00', estado: 'PENDIENTE' }]}
        />,
      );
      const boton = screen.getByRole('button', { name: /^confirmar$/i });
      fireEvent.click(boton);
      await waitFor(() => expect(fetchMock).toHaveBeenCalledWith('/api/solicitudes/5/confirmar', { method: 'POST' }));
      await waitFor(() => expect(screen.queryByRole('button', { name: /^confirmar$/i })).not.toBeInTheDocument());
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('TiraKpis sin focables y Esqueleto con status', () => {
    const { container, unmount } = render(<TiraKpis kpis={[{ etiqueta: 'X', valor: '1' }]} />);
    expect(container.querySelectorAll('a,button,input').length).toBe(0);
    unmount();
    render(<Esqueleto />);
    expect(screen.getByRole('status')).toBeInTheDocument();
  });

  it('navegación por rol usa la nueva información arquitectónica', () => {
    expect(DESTINOS.USUARIO.map((d) => d.href)).toEqual(['/configuracion', '/reservar']);
    expect(DESTINOS.ADMIN.map((d) => d.href)).toEqual(['/configuracion', '/pendientes', '/bloqueos', '/canchas', '/tarifas', '/kpis', '/reportes']);
    expect(DESTINOS.SUPERADMIN.map((d) => d.href)).toEqual(['/configuracion', '/sedes', '/canchas', '/tarifas', '/usuarios', '/reportes']);
    expect(DESTINOS.SUPERADMIN.find((d) => d.href === '/usuarios')?.etiqueta).toBe('Administrador');
    expect(DESTINOS.ADMIN.find((d) => d.href === '/kpis')?.etiqueta).toBe('Indicadores');
  });

  it('BannerSesion persistente', () => {
    render(<BannerSesion />);
    expect(screen.getByRole('status')).toHaveTextContent(/sesión/i);
  });
});
