import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/reservar',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));

import { FormularioSolicitud, precioCancha, tarifaAplicable } from '@/components/reservas/FormularioSolicitud';

describe('FormularioSolicitud (C-02/AC-02)', () => {
  it('al elegir sede pide canchas y las muestra', async () => {
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const u = String(url);
      if (u.includes('/api/sedes')) {
        return { ok: true, json: async () => ({ sedes: [{ id: 7, nombre: 'Norte' }] }) } as Response;
      }
      if (u.includes('/api/canchas')) {
        return { ok: true, json: async () => ({ canchas: [{ id: 9, nombre: 'C1', tarifaBaseCentavos: 5000 }] }) } as Response;
      }
      return { ok: false, json: async () => ({}) } as Response;
    });
    vi.stubGlobal('fetch', fetchMock);
    try {
      render(<FormularioSolicitud />);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Norte' })).toBeInTheDocument());
      const combos = screen.getAllByRole('combobox');
      fireEvent.change(combos[0], { target: { value: '7' } });
      await waitFor(() => expect(screen.getByRole('option', { name: /C1/ })).toBeInTheDocument());
      expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/canchas?sedeId=7&soloDisponibles=1'));
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('exige aceptar la condición de no cancelación', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('/api/sedes')) {
          return { ok: true, json: async () => ({ sedes: [{ id: 7, nombre: 'Norte' }] }) } as Response;
        }
        return { ok: true, json: async () => ({ canchas: [{ id: 9, nombre: 'C1', tarifaBaseCentavos: 5000 }] }) } as Response;
      }),
    );
    try {
      const { container } = render(<FormularioSolicitud />);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Norte' })).toBeInTheDocument());
      const combos = screen.getAllByRole('combobox');
      fireEvent.change(combos[0], { target: { value: '7' } });
      await waitFor(() => expect(screen.getByRole('option', { name: /C1/ })).toBeInTheDocument());
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '9' } });
      const fecha = container.querySelector('input[name="fecha"]') as HTMLInputElement;
      const hora = container.querySelector('input[name="horaInicio"]') as HTMLInputElement;
      fireEvent.change(fecha, { target: { value: '2027-01-01' } });
      fireEvent.change(hora, { target: { value: '10:00' } });
      fireEvent.click(screen.getByRole('button', { name: /solicitar/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/no cancelación/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('tarifaAplicable cruza día y horario de la sede', () => {    const tarifas = [
      { id: 1, nombre: 'L-J Día', diasSemana: [1, 2, 3, 4], horaInicio: '08:00', horaFin: '18:00', montoCentavos: 5000 },
      { id: 2, nombre: 'V-D Noche', diasSemana: [0, 5, 6], horaInicio: '18:00', horaFin: '22:00', montoCentavos: 9000 },
    ];
    // 2027-01-04 es lunes.
    expect(tarifaAplicable(tarifas, '2027-01-04', '10:00')?.nombre).toBe('L-J Día');
    expect(tarifaAplicable(tarifas, '2027-01-04', '19:00')).toBeNull();
    // 2027-01-03 es domingo.
    expect(tarifaAplicable(tarifas, '2027-01-03', '19:00')?.nombre).toBe('V-D Noche');
    expect(tarifaAplicable(tarifas, 'mala-fecha', '19:00')).toBeNull();
  });

  it('muestra la tarifa aplicable al elegir turno y bloquea hora no en punto', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string | URL | Request) => {
        const u = String(url);
        if (u.includes('/api/sedes')) {
          return { ok: true, json: async () => ({ sedes: [{ id: 7, nombre: 'Norte' }] }) } as Response;
        }
        if (u.includes('/api/tarifas')) {
          return {
            ok: true,
            json: async () => ({
              tarifas: [{ id: 1, nombre: 'L-J Día', diasSemana: [1, 2, 3, 4], horaInicio: '08:00', horaFin: '18:00', montoCentavos: 5000 }],
            }),
          } as Response;
        }
        return { ok: true, json: async () => ({ canchas: [{ id: 9, nombre: 'C1', tarifaBaseCentavos: 7000 }] }) } as Response;
      }),
    );
    try {
      const { container } = render(<FormularioSolicitud />);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Norte' })).toBeInTheDocument());
      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '7' } });
      await waitFor(() => expect(screen.getByRole('option', { name: /C1/ })).toBeInTheDocument());
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '9' } });
      const fecha = container.querySelector('input[name="fecha"]') as HTMLInputElement;
      const hora = container.querySelector('input[name="horaInicio"]') as HTMLInputElement;
      fireEvent.change(fecha, { target: { value: '2027-01-04' } });
      fireEvent.change(hora, { target: { value: '10:00' } });
      expect(await screen.findByRole('status')).toHaveTextContent(/Tarifa aplicable: L-J Día/);
      fireEvent.change(hora, { target: { value: '10:30' } });
      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /solicitar/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/hora en punto/i);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('precioCancha muestra el rango real de tarifas, no la base', () => {
    const cancha: { id: number; nombre: string; tarifaBaseCentavos: number } = {
      id: 9,
      nombre: 'PRO-C01',
      // Base heredada S/10 que no existe en ninguna tarifa de la sede.
      tarifaBaseCentavos: 1000,
    };
    const tarifas = [
      { id: 1, nombre: 'L-J (Día)', diasSemana: [1, 2, 3, 4], horaInicio: '08:00', horaFin: '18:00', montoCentavos: 5000 },
      { id: 2, nombre: 'L-J (Noche)', diasSemana: [1, 2, 3, 4], horaInicio: '18:00', horaFin: '22:00', montoCentavos: 7000 },
      { id: 3, nombre: 'V-D (Noche)', diasSemana: [0, 5, 6], horaInicio: '18:00', horaFin: '22:00', montoCentavos: 9000 },
    ];
    expect(precioCancha(cancha, tarifas)).toBe('S/ 50 a S/ 90 según día y hora');
    // Una sola tarifa → precio único.
    expect(precioCancha(cancha, [tarifas[0]])).toBe('S/ 50 por hora');
    // Sede sin tarifas: lo dice explícito, no inventa un precio.
    expect(precioCancha(cancha, [])).toBe('sin tarifa configurada');
    // Nunca anuncia el S/10 de la base.
    expect(precioCancha(cancha, tarifas)).not.toMatch(/10/);
  });

  // Reporte de producción: a las 20:12 en Lima se intentó 20:20 y el navegador
  // mostró un error de fecha, porque `hoy` se calculaba en UTC (ya 01:12 del
  // día siguiente). Aquí se fija el reloj a 20:12 de Lima.
  describe('20:12 en Lima intentando 20:20', () => {
    afterEach(() => {
      vi.useRealTimers();
    });

    async function montar() {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string | URL | Request) => {
          const u = String(url);
          if (u.includes('/api/sedes')) {
            return { ok: true, json: async () => ({ sedes: [{ id: 7, nombre: 'Los Olivos' }] }) } as Response;
          }
          if (u.includes('/api/tarifas')) {
            return {
              ok: true,
              json: async () => ({
                tarifas: [{ id: 1, nombre: 'L-J (Noche)', diasSemana: [0, 1, 2, 3, 4, 5, 6], horaInicio: '18:00', horaFin: '23:59', montoCentavos: 5000 }],
              }),
            } as Response;
          }
          return {
            ok: true,
            json: async () => ({ canchas: [{ id: 9, nombre: 'OLI-C01', tarifaBaseCentavos: 5000 }] }),
          } as Response;
        }),
      );
      const vista = render(<FormularioSolicitud />);
      await waitFor(() => expect(screen.getByRole('option', { name: 'Los Olivos' })).toBeInTheDocument());
      fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: '7' } });
      await waitFor(() => expect(screen.getByRole('option', { name: /OLI-C01/ })).toBeInTheDocument());
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: '9' } });
      return vista;
    }

    it('acepta la fecha de hoy y avisa del error de hora, no de fecha', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-10-01T01:12:00.000Z')); // 2026-09-30 20:12 Lima.
      const { container } = await montar();
      const fecha = container.querySelector('input[name="fecha"]') as HTMLInputElement;
      const hora = container.querySelector('input[name="horaInicio"]') as HTMLInputElement;

      // El campo fecha ofrece HOY en Lima, no mañana.
      expect(fecha).not.toHaveAttribute('min');
      expect(screen.getByText(/Hoy en Lima: 2026-09-30/)).toBeInTheDocument();

      fireEvent.change(fecha, { target: { value: '2026-09-30' } });
      fireEvent.change(hora, { target: { value: '20:20' } });

      // Aviso en vivo por la hora, no por la fecha.
      expect(await screen.findByText(/hora en punto/i)).toBeInTheDocument();
      expect(screen.queryByText(/fecha pasada/i)).not.toBeInTheDocument();

      fireEvent.click(screen.getByRole('checkbox'));
      fireEvent.click(screen.getByRole('button', { name: /solicitar/i }));
      expect(await screen.findByRole('alert')).toHaveTextContent(/hora en punto/i);
    });

    it('una hora en punto ya pasada avisa que el horario debe estar en el futuro', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-10-01T01:12:00.000Z'));
      const { container } = await montar();
      const campos = (c: HTMLElement) => ({
        fecha: c.querySelector('input[name="fecha"]') as HTMLInputElement,
        hora: c.querySelector('input[name="horaInicio"]') as HTMLInputElement,
      });
      const { fecha, hora } = campos(container);
      fireEvent.change(fecha, { target: { value: '2026-09-30' } });
      fireEvent.change(hora, { target: { value: '20:00' } });
      expect(await screen.findByText(/horario debe estar en el futuro/i)).toBeInTheDocument();
    });

    it('21:00 a las 20:12 se puede reservar (48 min de margen)', async () => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
      vi.setSystemTime(new Date('2026-10-01T01:12:00.000Z'));
      const { container } = await montar();
      const fecha = container.querySelector('input[name="fecha"]') as HTMLInputElement;
      const hora = container.querySelector('input[name="horaInicio"]') as HTMLInputElement;
      fireEvent.change(fecha, { target: { value: '2026-09-30' } });
      fireEvent.change(hora, { target: { value: '21:00' } });
      // Sin aviso de turno: 48 min de margen superan el corte de 15 min.
      expect(container.querySelector('.aviso-turno')).toBeNull();
    });
  });
});
