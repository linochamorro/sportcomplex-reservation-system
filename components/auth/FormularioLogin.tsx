'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function FormularioLogin() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  async function enviar(formulario: FormData) {
    setError(null);
    setCargando(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: formulario.get('email'), clave: formulario.get('clave') }),
      });
      if (!r.ok) {
        setError('Credenciales inválidas');
        return;
      }
      router.replace('/');
      router.refresh();
    } catch {
      setError('Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setCargando(false);
    }
  }

  return (
    <form
      action={(f) => {
        void enviar(f);
      }}
      aria-label="Iniciar sesión"
    >
      <label>
        Correo
        <input name="email" type="email" required autoComplete="email" />
      </label>
      <label>
        Clave
        <input name="clave" type="password" required autoComplete="current-password" minLength={8} />
      </label>
      {error ? (
        <div role="alert" tabIndex={-1} ref={(el) => el?.focus()}>
          {error}
        </div>
      ) : null}
      <button type="submit" disabled={cargando}>
        {cargando ? 'Entrando…' : 'Entrar'}
      </button>
    </form>
  );
}
