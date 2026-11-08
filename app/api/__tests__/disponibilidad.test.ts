// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/sesion', () => {
  class HttpError extends Error {
    estado: number;
    constructor(estado: number, mensaje: string) {
      super(mensaje);
      this.estado = estado;
    }
  }
  return {
    HttpError,
    exigirRol: vi.fn().mockReturnValue({ rol: 'SUPERADMIN' }),
    leerSesionDeCabecera: vi.fn(),
  };
});

vi.mock('@/lib/db/cliente', () => ({
  bd: {
    $transaction: vi.fn(),
    sede: { findFirst: vi.fn() },
    tarifa: { count: vi.fn(), create: vi.fn(), findFirst: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    cancha: { create: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    solicitud: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
  },
}));

import { bd } from '@/lib/db/cliente';
import { POST as crearCancha } from '../canchas/route';
import { DELETE as eliminarCancha, PUT as actualizarCancha } from '../canchas/[id]/route';
import { GET as vistaEliminacion } from '../canchas/[id]/eliminacion/route';
import { POST as reasignar } from '../canchas/[id]/reasignar/route';
import { POST as crearTarifa } from '../tarifas/route';
import { PUT as actualizarTarifa } from '../tarifas/[id]/route';

function peticion(ruta: string, metodo: string, cuerpo?: unknown): NextRequest {
  return new NextRequest(`http://prueba${ruta}`, {
    method: metodo,
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('disponibilidad automática', () => {
  it('crea la cancha no disponible cuando la sede no tiene tarifas', async () => {
    vi.mocked(bd.sede.findFirst).mockResolvedValue({ id: 7 } as never);
    vi.mocked(bd.tarifa.count).mockResolvedValue(0);
    vi.mocked(bd.cancha.create).mockResolvedValue({} as never);
    const r = await crearCancha(peticion('/api/canchas', 'POST', { sedeId: 7, nombre: 'A1', tarifaBaseCentavos: 5000 }));
    expect(r.status).toBe(201);
    expect(vi.mocked(bd.cancha.create)).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ estado: 'NO_DISPONIBLE', motivoNoDisponible: 'Sin tarifa asignada' }),
      }),
    );
  });

  it('activa las canchas automáticas al crear la primera tarifa', async () => {
    vi.mocked(bd.sede.findFirst).mockResolvedValue({ id: 7, apertura: '08:00', cierre: '22:00' } as never);
    vi.mocked(bd.tarifa.create).mockResolvedValue({ id: 9 } as never);
    vi.mocked(bd.cancha.updateMany).mockResolvedValue({ count: 1 });
    const r = await crearTarifa(
      peticion('/api/tarifas', 'POST', {
        sedeId: 7,
        nombre: 'Alta',
        diasSemana: [1],
        horaInicio: '08:00',
        horaFin: '09:00',
        montoCentavos: 5000,
      }),
    );
    expect(r.status).toBe(201);
    expect(vi.mocked(bd.cancha.updateMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sedeId: 7, estado: 'NO_DISPONIBLE' }) }),
    );
  });

  it('rechaza una tarifa fuera del horario de la sede', async () => {
    vi.mocked(bd.sede.findFirst).mockResolvedValue({ id: 7, apertura: '08:00', cierre: '22:00' } as never);
    const r = await crearTarifa(
      peticion('/api/tarifas', 'POST', {
        sedeId: 7,
        nombre: 'Madrugada',
        diasSemana: [1],
        horaInicio: '06:00',
        horaFin: '07:00',
        montoCentavos: 5000,
      }),
    );
    expect(r.status).toBe(400);
    expect(vi.mocked(bd.tarifa.create)).not.toHaveBeenCalled();
  });

  it('impide marcar disponible una cancha sin tarifa vigente', async () => {
    vi.mocked(bd.cancha.findFirst).mockResolvedValue({ id: 11, sedeId: 7 } as never);
    vi.mocked(bd.sede.findFirst).mockResolvedValue({ id: 7 } as never);
    vi.mocked(bd.tarifa.count).mockResolvedValue(0);
    const r = await actualizarCancha(
      peticion('/api/canchas/11', 'PUT', { nombre: 'A1', tarifaBaseCentavos: 5000, estado: 'DISPONIBLE' }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(r.status).toBe(409);
    expect(vi.mocked(bd.cancha.update)).not.toHaveBeenCalled();
  });

  it('muestra turnos y bloquea la eliminación mientras haya turnos', async () => {
    const fecha = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    const turnos = [{ id: 21, fecha, horaInicio: '10:00', horaFin: '11:00', estado: 'PENDIENTE', usuarioId: 3 }];
    vi.mocked(bd.$transaction).mockImplementation(async (callback: Parameters<typeof bd.$transaction>[0]) =>
      callback({
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
      } as never),
    );
    const vista = await vistaEliminacion(new NextRequest('http://prueba/api/canchas/11/eliminacion'), {
      params: Promise.resolve({ id: '11' }),
    });
    expect(vista.status).toBe(200);
    expect(await vista.json()).toMatchObject({ turnos: [{ id: 21, alternativas: [{ id: 12, libre: true }] }] });
    const borrado = await eliminarCancha(new NextRequest('http://prueba/api/canchas/11', { method: 'DELETE' }), {
      params: Promise.resolve({ id: '11' }),
    });
    expect(borrado.status).toBe(409);
  });

  it('verifica un destino antes de reasignar', async () => {
    const fecha = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
    vi.mocked(bd.$transaction).mockImplementation(async (callback: Parameters<typeof bd.$transaction>[0]) =>
      callback({
        cancha: {
          findUnique: vi.fn()
            .mockResolvedValueOnce({ id: 11, sedeId: 7, nombre: 'A1', estado: 'DISPONIBLE', eliminadoEn: null })
            .mockResolvedValueOnce({ id: 12, sedeId: 7, nombre: 'A2', estado: 'DISPONIBLE', eliminadoEn: null }),
        },
        solicitud: {
          findUnique: vi.fn().mockResolvedValue({ id: 21, canchaId: 11, estado: 'CONFIRMADA', eliminadoEn: null }),
          findMany: vi.fn().mockResolvedValue([]),
        },
      } as never),
    );
    const r = await reasignar(
      peticion('/api/canchas/11/reasignar', 'POST', {
        solicitudId: 21,
        canchaDestinoId: 12,
        fecha,
        horaInicio: '10:00',
        verificar: true,
      }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ libre: true });
  });

  it('actualiza cancha y tarifa con datos válidos', async () => {
    vi.mocked(bd.cancha.findFirst).mockResolvedValue({ id: 11, sedeId: 7 } as never);
    vi.mocked(bd.sede.findFirst).mockResolvedValue({ id: 7 } as never);
    vi.mocked(bd.tarifa.count).mockResolvedValue(1);
    vi.mocked(bd.cancha.update).mockResolvedValue({} as never);
    const cancha = await actualizarCancha(
      peticion('/api/canchas/11', 'PUT', {
        nombre: 'A1',
        tarifaBaseCentavos: 6000,
        estado: 'DISPONIBLE',
        motivoNoDisponible: null,
      }),
      { params: Promise.resolve({ id: '11' }) },
    );
    expect(cancha.status).toBe(200);
    vi.mocked(bd.tarifa.findFirst).mockResolvedValue({ id: 9, sedeId: 7 } as never);
    vi.mocked(bd.sede.findFirst).mockResolvedValue({ id: 7, apertura: '08:00', cierre: '22:00' } as never);
    vi.mocked(bd.tarifa.update).mockResolvedValue({} as never);
    const tarifa = await actualizarTarifa(
      peticion('/api/tarifas/9', 'PUT', {
        nombre: 'Alta',
        diasSemana: [1],
        horaInicio: '08:00',
        horaFin: '09:00',
        montoCentavos: 6000,
      }),
      { params: Promise.resolve({ id: '9' }) },
    );
    expect(tarifa.status).toBe(200);
  });
});
