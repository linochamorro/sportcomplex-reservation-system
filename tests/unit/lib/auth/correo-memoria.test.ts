import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('./sesion', () => ({ HttpError: class HttpError extends Error {} }));

import { CorreoMemoria } from '@/lib/auth/correo';

describe('CorreoMemoria', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('conserva la recuperación en memoria sin imprimir datos sensibles', async () => {
    const destinatario = 'regresion-correo@ejemplo.com';
    const token = 'token-sintetico-regresion-7f3a';
    const spies = [
      vi.spyOn(console, 'log').mockImplementation(() => {}),
      vi.spyOn(console, 'info').mockImplementation(() => {}),
      vi.spyOn(console, 'warn').mockImplementation(() => {}),
      vi.spyOn(console, 'error').mockImplementation(() => {}),
    ];
    const correo = new CorreoMemoria();

    await correo.enviarRecuperacion(destinatario, token);

    expect(correo.enviados).toEqual([{ destinatario, token }]);
    const llamadas = JSON.stringify(spies.flatMap((spy) => spy.mock.calls));
    expect(llamadas).not.toContain(destinatario);
    expect(llamadas).not.toContain(token);
    expect(llamadas).not.toContain('/recuperar-clave?token=');
  });
});
