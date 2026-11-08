import { describe, expect, it, vi } from 'vitest';
import { verificarDestinoTx, vistaEliminacionTx } from '@/lib/domain/reasignacion';

const SESION = { id: 1, rol: 'SUPERADMIN' as const, sedeId: null };
const fecha = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);

describe('reasignación por cierre de cancha', () => {
  it('muestra turnos futuros y disponibilidad en la misma sede', async () => {
    const turnos = [{ id: 21, fecha, horaInicio: '10:00', horaFin: '11:00', estado: 'PENDIENTE', usuarioId: 3 }];
    const tx = {
      cancha: {
        findUnique: vi.fn().mockResolvedValue({ id: 11, sedeId: 7, nombre: 'A1', estado: 'DISPONIBLE', eliminadoEn: null }),
        findMany: vi.fn().mockResolvedValue([{ id: 12, nombre: 'A2', estado: 'DISPONIBLE' }]),
      },
      solicitud: {
        findMany: vi.fn().mockImplementation((args: { where: { canchaId: number } }) => {
          if (args.where.canchaId === 11) return Promise.resolve(turnos);
          return Promise.resolve([]);
        }),
      },
    };
    const vista = await vistaEliminacionTx(tx as never, SESION, 11);
    expect(vista.turnos).toHaveLength(1);
    expect(vista.turnos[0].alternativas).toEqual([
      expect.objectContaining({ id: 12, nombre: 'A2', libre: true }),
    ]);
  });

  it('detecta un destino ocupado', async () => {
    const tx = {
      cancha: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: 11, sedeId: 7, nombre: 'A1', estado: 'DISPONIBLE', eliminadoEn: null })
          .mockResolvedValueOnce({ id: 12, sedeId: 7, nombre: 'A2', estado: 'DISPONIBLE', eliminadoEn: null }),
      },
      solicitud: {
        findUnique: vi.fn().mockResolvedValue({ id: 21, canchaId: 11, estado: 'CONFIRMADA', eliminadoEn: null }),
        findMany: vi.fn().mockResolvedValue([{ fecha, horaInicio: '10:00', horaFin: '11:00' }]),
      },
    };
    const resultado = await verificarDestinoTx(tx as never, SESION, 11, 21, 12, fecha, '10:00');
    expect(resultado).toEqual({ libre: false });
  });
});
