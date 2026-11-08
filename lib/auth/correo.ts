import nodemailer, { type Transporter } from 'nodemailer';
import { HttpError } from './sesion';

export interface Correo {
  enviarRecuperacion(destinatario: string, token: string): Promise<void>;
}

export class CorreoMemoria implements Correo {
  readonly enviados: Array<{ destinatario: string; token: string }> = [];

  async enviarRecuperacion(destinatario: string, token: string): Promise<void> {
    this.enviados.push({ destinatario, token });
    // En desarrollo el correo no sale a internet: se imprime el enlace para
    // poder completar la recuperación sin configurar SMTP.
    const url = `${(process.env.FRONTEND_URL ?? 'http://localhost:3000').replace(/\/$/, '')}/recuperar-clave?token=${encodeURIComponent(token)}`;
    console.log(JSON.stringify({ evento: 'recuperacion_correo_local', destinatario, enlace: url }));
  }
}

export class CorreoSmtp implements Correo {
  private readonly transporte: Transporter;
  private readonly remitente: string;
  private readonly frontendUrl: string;

  constructor(host: string, port: number, secure: boolean, user: string, pass: string, remitente: string, frontendUrl: string) {
    this.remitente = remitente;
    this.frontendUrl = frontendUrl;
    this.transporte = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: { user, pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
  }

  async enviarRecuperacion(destinatario: string, token: string): Promise<void> {
    const url = `${this.frontendUrl.replace(/\/$/, '')}/recuperar-clave?token=${encodeURIComponent(token)}`;
    await this.transporte.sendMail({
      from: this.remitente,
      to: destinatario,
      subject: 'Recuperación de contraseña',
      text: `Para recuperar tu contraseña, abre este enlace: ${url}. El enlace vence en 30 minutos.`,
    });
  }
}

let memoria: CorreoMemoria | null = null;
let smtp: CorreoSmtp | null = null;

export async function enviarRecuperacionSilencioso(destinatario: string, token: string): Promise<boolean> {
  try {
    await obtenerCorreo().enviarRecuperacion(destinatario, token);
    return true;
  } catch (error) {
    const codigo = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'desconocido';
    console.error(JSON.stringify({ evento: 'recuperacion_correo_fallida', codigo }));
    return false;
  }
}

export function obtenerCorreo(): Correo {
  if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    memoria ??= new CorreoMemoria();
    return memoria;
  }
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM;
  const frontendUrl = process.env.FRONTEND_URL;
  if (!host || !user || !pass || !from || !frontendUrl) {
    throw new HttpError(503, 'Correo no configurado');
  }
  const port = Number(process.env.SMTP_PORT ?? 587);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new HttpError(503, 'Correo no configurado');
  }
  smtp ??= new CorreoSmtp(
    host,
    port,
    process.env.SMTP_SECURE === '1' || port === 465,
    user,
    pass,
    from,
    frontendUrl,
  );
  return smtp;
}
