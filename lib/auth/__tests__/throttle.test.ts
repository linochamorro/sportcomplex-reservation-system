import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db/cliente', () => ({
  bd: {
    $queryRaw: vi.fn(),
    intentoLogin: { delete: vi.fn() },
  },
}));

import { bd } from '@/lib/db/cliente';
import { claveThrottleIp, consumirIntento, limpiarIntentos } from '../throttle';

const ID = 'prueba@prueba.local';
const entorno = process.env as Record<string, string | undefined>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('throttle distribuido 5/60s', () => {
  it('consume el intento con una única operación atómica', async () => {
    vi.mocked(bd.$queryRaw).mockResolvedValue([{ bloqueado: false }]);
    expect(await consumirIntento(ID)).toBe(false);
    expect(bd.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('bloquea al alcanzar el quinto intento', async () => {
    vi.mocked(bd.$queryRaw).mockResolvedValue([{ bloqueado: true }]);
    expect(await consumirIntento(ID)).toBe(true);
  });

  it('falla cerrado si PostgreSQL no responde', async () => {
    vi.mocked(bd.$queryRaw).mockRejectedValue(new Error('caída'));
    expect(await consumirIntento(ID)).toBe(true);
  });

  it('los intentos concurrentes conservan la serialización de PostgreSQL', async () => {
    vi.mocked(bd.$queryRaw)
      .mockResolvedValueOnce([{ bloqueado: false }])
      .mockResolvedValueOnce([{ bloqueado: false }])
      .mockResolvedValueOnce([{ bloqueado: false }])
      .mockResolvedValueOnce([{ bloqueado: false }])
      .mockResolvedValueOnce([{ bloqueado: true }]);
    const resultados = await Promise.all(Array.from({ length: 5 }, () => consumirIntento(ID)));
    expect(resultados.filter(Boolean)).toHaveLength(1);
  });

  it('usa solo la IP calculada por Vercel en producción', () => {
    const original = process.env.NODE_ENV;
    entorno.NODE_ENV = 'production';
    const headers = new Headers({
      'x-real-ip': '203.0.113.1',
      'x-forwarded-for': '198.51.100.9',
    });
    expect(claveThrottleIp(headers)).toBe(claveThrottleIp(new Headers({ 'x-real-ip': '203.0.113.1' })));
    expect(claveThrottleIp(new Headers({ 'x-forwarded-for': '198.51.100.9' }))).toBeNull();
    entorno.NODE_ENV = original;
  });

  it('limpia el contador tras autenticación válida', async () => {
    vi.mocked(bd.intentoLogin.delete).mockResolvedValue({} as never);
    await limpiarIntentos(ID);
    expect(vi.mocked(bd.intentoLogin.delete)).toHaveBeenCalledWith({
      where: { identificador: ID },
    });
  });
});
