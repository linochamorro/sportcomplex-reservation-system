// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/auth/sesion', () => ({
  exigirSesion: vi.fn().mockReturnValue({ id: 7 }),
  leerSesionDeCabecera: vi.fn(),
}));

vi.mock('@/lib/auth/hash', () => ({
  hachearClave: vi.fn().mockResolvedValue('nuevo-hash'),
  verificarClave: vi.fn(),
}));

vi.mock('@/lib/db/cliente', () => ({
  bd: { usuario: { findUnique: vi.fn(), update: vi.fn() } },
}));

import { bd } from '@/lib/db/cliente';
import { verificarClave } from '@/lib/auth/hash';
import { PUT as cambiarClave } from '../cuenta/clave/route';
import { GET as leerPerfil, PUT as actualizarPerfil } from '../cuenta/perfil/route';

function peticion(ruta: string, cuerpo?: unknown): NextRequest {
  return new NextRequest(`http://prueba${ruta}`, {
    method: 'PUT',
    body: cuerpo ? JSON.stringify(cuerpo) : undefined,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('cuenta del titular', () => {
  it('lee y actualiza el perfil propio', async () => {
    vi.mocked(bd.usuario.findUnique).mockResolvedValue({ telefono: '999' } as never);
    expect((await leerPerfil(new NextRequest('http://prueba/api/cuenta/perfil'))).status).toBe(200);
    vi.mocked(bd.usuario.update).mockResolvedValue({ nombre: 'Nuevo' } as never);
    const r = await actualizarPerfil(peticion('/api/cuenta/perfil', { nombre: 'Nuevo', telefono: '999' }));
    expect(r.status).toBe(200);
    expect(vi.mocked(bd.usuario.update)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { nombre: 'Nuevo', telefono: '999' } }),
    );
  });

  it('rechaza un nombre inválido sin actualizar', async () => {
    const r = await actualizarPerfil(peticion('/api/cuenta/perfil', { nombre: 'A' }));
    expect(r.status).toBe(400);
    expect(vi.mocked(bd.usuario.update)).not.toHaveBeenCalled();
  });

  it('cambia la clave tras verificar la actual', async () => {
    vi.mocked(bd.usuario.findUnique).mockResolvedValue({ passwordHash: 'hash' } as never);
    vi.mocked(verificarClave).mockResolvedValue(true);
    const r = await cambiarClave(peticion('/api/cuenta/clave', { actual: 'Actual_99', nueva: 'Nueva_Clave_99' }));
    expect(r.status).toBe(200);
    expect(vi.mocked(bd.usuario.update)).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 7 }, data: { passwordHash: 'nuevo-hash' } }),
    );
  });

  it('rechaza la clave actual incorrecta', async () => {
    vi.mocked(bd.usuario.findUnique).mockResolvedValue({ passwordHash: 'hash' } as never);
    vi.mocked(verificarClave).mockResolvedValue(false);
    const r = await cambiarClave(peticion('/api/cuenta/clave', { actual: 'Mala_99', nueva: 'Nueva_Clave_99' }));
    expect(r.status).toBe(400);
    expect(vi.mocked(bd.usuario.update)).not.toHaveBeenCalled();
  });
});
