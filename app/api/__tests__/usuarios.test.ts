// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/sesion', () => ({
  exigirRol: vi.fn().mockReturnValue({ rol: 'SUPERADMIN' }),
  leerSesionDeCabecera: vi.fn(),
}));

vi.mock('@/lib/auth/hash', () => ({
  hachearClave: vi.fn().mockResolvedValue('hash'),
}));

vi.mock('@/lib/db/cliente', () => ({
  bd: { sede: { findFirst: vi.fn() }, usuario: { create: vi.fn(), findMany: vi.fn() } },
}));

import { bd } from '@/lib/db/cliente';
import { GET as listarUsuarios, POST as crearUsuario } from '../usuarios/route';

function peticion(cuerpo: unknown): NextRequest {
  return new NextRequest('http://prueba/api/usuarios', {
    method: 'POST',
    body: JSON.stringify(cuerpo),
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('creación de administradores', () => {
  it('lista administradores sin filtrar por una sede inexistente', async () => {
    vi.mocked(bd.usuario.findMany).mockResolvedValue([]);
    const r = await listarUsuarios(new NextRequest('http://prueba/api/usuarios?rol=ADMIN'));
    expect(r.status).toBe(200);
    expect(vi.mocked(bd.usuario.findMany)).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.not.objectContaining({ sedeId: 0 }) }),
    );
  });

  it('fuerza el rol ADMIN aunque el cuerpo pida otro rol', async () => {
    vi.mocked(bd.sede.findFirst).mockResolvedValue({ id: 3 } as never);
    vi.mocked(bd.usuario.create).mockResolvedValue({} as never);
    const r = await crearUsuario(
      peticion({ email: 'admin@prueba.local', clave: 'Secreta_99', nombre: 'Admin', rol: 'USUARIO', sedeId: 3 }),
    );
    expect(r.status).toBe(201);
    expect(vi.mocked(bd.usuario.create)).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ rol: 'ADMIN', sedeId: 3 }) }),
    );
  });

  it('exige una sede vigente', async () => {
    vi.mocked(bd.sede.findFirst).mockResolvedValue(null);
    const r = await crearUsuario(
      peticion({ email: 'admin@prueba.local', clave: 'Secreta_99', nombre: 'Admin', rol: 'ADMIN', sedeId: 3 }),
    );
    expect(r.status).toBe(404);
    expect(vi.mocked(bd.usuario.create)).not.toHaveBeenCalled();
  });
});
