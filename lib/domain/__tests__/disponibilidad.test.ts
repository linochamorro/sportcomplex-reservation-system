import { describe, expect, it, vi } from 'vitest';
import { activarCanchasAutomaticas, sedeTieneTarifa, validarCambioEstadoCancha } from '@/lib/domain/disponibilidad';

describe('disponibilidad de canchas', () => {
  it('valida el estado automático y el motivo manual', () => {
    expect(validarCambioEstadoCancha('DISPONIBLE', null, true)).toEqual({ estado: 'DISPONIBLE', motivoNoDisponible: null });
    expect(() => validarCambioEstadoCancha('DISPONIBLE', null, false)).toThrowError('tarifa vigente');
    expect(validarCambioEstadoCancha('NO_DISPONIBLE', 'Mantenimiento', true)).toEqual({
      estado: 'NO_DISPONIBLE',
      motivoNoDisponible: 'Mantenimiento',
    });
    expect(() => validarCambioEstadoCancha('NO_DISPONIBLE', '  ', true)).toThrowError('Datos inválidos');
  });

  it('detecta tarifas y activa solo las canchas automáticas', async () => {
    const count = vi.fn().mockResolvedValue(1);
    expect(await sedeTieneTarifa({ tarifa: { count } }, 7)).toBe(true);
    const updateMany = vi.fn().mockResolvedValue({ count: 2 });
    await activarCanchasAutomaticas({ cancha: { updateMany } }, 7);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ sedeId: 7, estado: 'NO_DISPONIBLE', motivoNoDisponible: 'Sin tarifa asignada' }),
      }),
    );
  });
});
