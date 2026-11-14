'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';

export function FormularioRecuperar({ tokenInicial = '' }: { tokenInicial?: string }) {
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [cambiando, setCambiando] = useState(false);
  const referenciaMensaje = useRef<HTMLParagraphElement | null>(null);

  useEffect(() => {
    if (mensaje || error) referenciaMensaje.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [mensaje, error]);

  async function pedir(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setMensaje(null);
    setError(null);
    setEnviando(true);
    try {
      const formulario = new FormData(evento.currentTarget);
      const r = await fetch('/api/auth/recuperar', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: formulario.get('email') }),
      });
      if (!r.ok) throw new Error();
      setMensaje('Solicitud recibida. Si existe una cuenta, recibirás el enlace. Revisa también la carpeta de spam.');
    } catch {
      setError('No se pudo procesar la solicitud. Inténtalo nuevamente.');
    } finally {
      setEnviando(false);
    }
  }

  async function cambiar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    setMensaje(null);
    setError(null);
    setCambiando(true);
    try {
      const formulario = new FormData(evento.currentTarget);
      const r = await fetch('/api/auth/recuperar', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: formulario.get('token'), clave: formulario.get('clave') }),
      });
      if (!r.ok) throw new Error();
      setMensaje('Clave actualizada. Ya puedes iniciar sesión.');
    } catch {
      setError('El enlace es inválido o venció. Solicita uno nuevo.');
    } finally {
      setCambiando(false);
    }
  }

  return (
    <div>
      {error ? <p ref={referenciaMensaje} tabIndex={-1} className="auth-message auth-error" role="alert">{error}</p> : null}
      {mensaje ? <p ref={referenciaMensaje} tabIndex={-1} className="auth-message" role="status">{mensaje}</p> : null}
      <div className="auth-recovery-grid">
        <form className="auth-card" onSubmit={pedir} aria-label="Solicitar recuperación">
        <h2>Solicitar enlace</h2>
        <p>Te enviaremos un enlace válido durante 30 minutos.</p>
        <label>
          Correo
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <button type="submit" disabled={enviando}>{enviando ? 'Enviando…' : 'Enviar enlace'}</button>
      </form>
      <form className="auth-card" onSubmit={cambiar} aria-label="Definir nueva clave">
        <h2>Definir nueva clave</h2>
        <p>Usa el código recibido en el correo.</p>
        <label>
          Código del correo
          <input name="token" defaultValue={tokenInicial} required minLength={32} autoComplete="one-time-code" />
        </label>
        <label>
          Nueva clave
          <input name="clave" type="password" required autoComplete="new-password" minLength={8} />
        </label>
        <button type="submit" disabled={cambiando}>{cambiando ? 'Guardando…' : 'Cambiar clave'}</button>
      </form>
      </div>
    </div>
  );
}
