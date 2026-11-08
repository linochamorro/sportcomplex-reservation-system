// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/sesion', () => ({
  exigirRol: vi.fn().mockReturnValue({ rol: 'SUPERADMIN' }),
  leerSesionDeCabecera: vi.fn(),
}));

vi.mock('@/lib/db/cliente', () => ({
  bd: {
    sede: { findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
    cancha: { create: vi.fn() },
    tarifa: { create: vi.fn() },
    usuario: { create: vi.fn() },
  },
}));

import { bd } from '@/lib/db/cliente';
import { DELETE as eliminarSede, PUT as actualizarSede } from '../sedes/[id]/route';
import { POST as crearCancha } from '../canchas/route';
import { POST as crearTarifa } from '../tarifas/route';
import { POST as crearUsuario } from '../usuarios/route';

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

describe('gestión de sedes', () => {
  it('actualiza una sede vigente', async () => {
    vi.mocked(bd.sede.findFirst).mockResolvedValue({ id: 7 } as never);
    vi.mocked(bd.sede.update).mockResolvedValue({ id: 7, nombre: 'Norte' } as never);
    const r = await actualizarSede(
      peticion('/api/sedes/7', 'PUT', { nombre: 'Norte', direccion: 'Av. 1', apertura: '08:00', cierre: '22:00' }),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(r.status).toBe(200);
    expect(vi.mocked(bd.sede.update)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: expect.objectContaining({ nombre: 'Norte' }) }),
    );
  });

  it('rechaza datos inválidos y sedes inexistentes', async () => {
    const mala = await actualizarSede(
      peticion('/api/sedes/7', 'PUT', { nombre: '', apertura: '08:00', cierre: '22:00' }),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(mala.status).toBe(400);
    vi.mocked(bd.sede.findFirst).mockResolvedValue(null);
    const ausente = await actualizarSede(
      peticion('/api/sedes/7', 'PUT', { nombre: 'Norte', apertura: '08:00', cierre: '22:00' }),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(ausente.status).toBe(404);
    expect(vi.mocked(bd.sede.update)).not.toHaveBeenCalled();
  });

  it('reporta nombres duplicados como conflicto', async () => {
    vi.mocked(bd.sede.findFirst).mockResolvedValue({ id: 7 } as never);
    vi.mocked(bd.sede.update).mockRejectedValue({ code: 'P2002' });
    const r = await actualizarSede(
      peticion('/api/sedes/7', 'PUT', { nombre: 'Norte', apertura: '08:00', cierre: '22:00' }),
      { params: Promise.resolve({ id: '7' }) },
    );
    expect(r.status).toBe(409);
  });

  it('bloquea la eliminación cuando la sede sigue en uso', async () => {
    vi.mocked(bd.sede.findFirst).mockResolvedValue({ id: 7 } as never);
    const r = await eliminarSede(peticion('/api/sedes/7', 'DELETE'), { params: Promise.resolve({ id: '7' }) });
    expect(r.status).toBe(409);
    expect(vi.mocked(bd.sede.updateMany)).not.toHaveBeenCalled();
  });

  it('desactiva una sede vigente y reporta la ausente', async () => {
    vi.mocked(bd.sede.findFirst).mockResolvedValue(null);
    vi.mocked(bd.sede.updateMany).mockResolvedValue({ count: 1 });
    const r = await eliminarSede(peticion('/api/sedes/7', 'DELETE'), { params: Promise.resolve({ id: '7' }) });
    expect(r.status).toBe(200);
    vi.mocked(bd.sede.updateMany).mockResolvedValue({ count: 0 });
    const ausente = await eliminarSede(peticion('/api/sedes/7', 'DELETE'), { params: Promise.resolve({ id: '7' }) });
    expect(ausente.status).toBe(404);
  });

  it('no crea recursos en sedes inactivas', async () => {
    vi.mocked(bd.sede.findFirst).mockResolvedValue(null);
    expect(
      (await crearCancha(peticion('/api/canchas', 'POST', { sedeId: 7, nombre: 'A1', tarifaBaseCentavos: 5000 }))).status,
    ).toBe(404);
    expect(
      (
        await crearTarifa(
          peticion('/api/tarifas', 'POST', {
            sedeId: 7,
            nombre: 'Alta',
            diasSemana: [1],
            horaInicio: '08:00',
            horaFin: '09:00',
            montoCentavos: 5000,
          }),
        )
      ).status,
    ).toBe(404);
    expect(
      (
        await crearUsuario(
          peticion('/api/usuarios', 'POST', {
            email: 'admin@prueba.local',
            clave: 'Secreta_99',
            nombre: 'Admin',
            rol: 'ADMIN',
            sedeId: 7,
          }),
        )
      ).status,
    ).toBe(404);
    expect(vi.mocked(bd.cancha.create)).not.toHaveBeenCalled();
    expect(vi.mocked(bd.tarifa.create)).not.toHaveBeenCalled();
    expect(vi.mocked(bd.usuario.create)).not.toHaveBeenCalled();
  });
});
