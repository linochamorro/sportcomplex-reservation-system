import { afterEach, describe, expect, it, vi } from 'vitest';

const smtp = vi.hoisted(() => ({ enviar: vi.fn(), crear: vi.fn() }));

vi.mock('nodemailer', () => ({
  default: { createTransport: smtp.crear },
}));

import { CorreoMemoria, CorreoSmtp, obtenerCorreo } from '../correo';

const entorno = process.env as Record<string, string | undefined>;
const originales = {
  NODE_ENV: entorno.NODE_ENV,
  SMTP_HOST: entorno.SMTP_HOST,
  SMTP_PORT: entorno.SMTP_PORT,
  SMTP_SECURE: entorno.SMTP_SECURE,
  SMTP_USER: entorno.SMTP_USER,
  SMTP_PASS: entorno.SMTP_PASS,
  SMTP_FROM: entorno.SMTP_FROM,
  FRONTEND_URL: entorno.FRONTEND_URL,
};

function restaurar(nombre: string, valor: string | undefined): void {
  if (valor === undefined) delete entorno[nombre];
  else entorno[nombre] = valor;
}

afterEach(() => {
  for (const [nombre, valor] of Object.entries(originales)) restaurar(nombre, valor);
  vi.clearAllMocks();
});

describe('correo', () => {
  it('captura el enlace de recuperación en memoria', async () => {
    entorno.NODE_ENV = 'test';
    const correo = obtenerCorreo() as CorreoMemoria;
    await correo.enviarRecuperacion('persona@prueba.local', 'token opaco');
    expect(correo.enviados).toEqual([{ destinatario: 'persona@prueba.local', token: 'token opaco' }]);
  });

  it('envía por SMTP con timeout y remitente configurado', async () => {
    smtp.crear.mockReturnValue({ sendMail: smtp.enviar });
    smtp.enviar.mockResolvedValue({ messageId: 'id' });
    const correo = new CorreoSmtp(
      'smtp.prueba.local',
      465,
      true,
      'usuario',
      'secreto',
      'remitente@prueba.local',
      'https://app.prueba',
    );
    await correo.enviarRecuperacion('persona@prueba.local', 'token opaco');
    expect(smtp.crear).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }));
    expect(smtp.enviar).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'persona@prueba.local', from: 'remitente@prueba.local' }),
    );
  });
});
