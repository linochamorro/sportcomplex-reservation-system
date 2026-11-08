import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import proxy from '../../../proxy';
import { origenPermitido } from '../csrf';

function cabeceras(valores: Record<string, string>): Headers {
  return new Headers(valores);
}

describe('protección CSRF por origen', () => {
  it('permite métodos seguros', () => {
    expect(origenPermitido('GET', cabeceras({}), 'app.prueba')).toBe(true);
  });

  it('permite mutaciones same-origin', () => {
    const headers = cabeceras({ origin: 'https://app.prueba', host: 'app.prueba' });
    expect(origenPermitido('POST', headers)).toBe(true);
  });

  it('rechaza origen distinto, ausente y Sec-Fetch-Site cross-site', () => {
    expect(
      origenPermitido('POST', cabeceras({ origin: 'https://otro.prueba', host: 'app.prueba' })),
    ).toBe(false);
    expect(origenPermitido('POST', cabeceras({ host: 'app.prueba' }))).toBe(false);
    expect(
      origenPermitido(
        'POST',
        cabeceras({ origin: 'https://app.prueba', host: 'app.prueba', 'sec-fetch-site': 'cross-site' }),
      ),
    ).toBe(false);
  });

  it('acepta el host público detrás de proxy', () => {
    const headers = cabeceras({
      origin: 'https://app.prueba',
      'x-forwarded-host': 'app.prueba, proxy.interno',
      host: 'proxy.interno',
    });
    expect(origenPermitido('PUT', headers)).toBe(true);
  });

  it('bloquea login cross-origin antes del handler', async () => {
    const peticion = new NextRequest('https://app.prueba/api/auth/login', {
      method: 'POST',
      headers: { origin: 'https://atacante.prueba' },
    });
    const respuesta = await proxy(peticion);
    expect(respuesta.status).toBe(403);
  });

  it('exime al cron Bearer de la validación por Origin', async () => {
    const peticion = new NextRequest('https://app.prueba/api/mantenimiento', { method: 'POST' });
    const respuesta = await proxy(peticion);
    expect(respuesta.status).toBe(200);
  });
});
