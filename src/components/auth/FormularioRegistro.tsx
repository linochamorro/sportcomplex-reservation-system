'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export function FormularioRegistro() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [creando, setCreando] = useState(false);
  const [ingresando, setIngresando] = useState(false);
  const [credenciales, setCredenciales] = useState<{ email: string; clave: string } | null>(null);

  async function enviar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    setError(null);
    setCreando(true);
    try {
      const datos = new FormData(formulario);
      const email = String(datos.get('email') ?? '').trim();
      const clave = String(datos.get('clave') ?? '');
      const r = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email,
          clave,
          nombre: datos.get('nombre'),
          telefono: datos.get('telefono'),
        }),
      });
      const j = (await r.json().catch(() => null)) as { creada?: boolean; error?: string } | null;
      if (!r.ok || !j?.creada) throw new Error(j?.error ?? 'Revisa los datos e inténtalo de nuevo');
      setCredenciales({ email, clave });
      setExito(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa los datos e inténtalo de nuevo');
    } finally {
      setCreando(false);
    }
  }

  async function aceptar() {
    if (!credenciales) {
      router.replace('/login');
      return;
    }
    setIngresando(true);
    try {
      const r = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(credenciales),
      });
      router.replace(r.ok ? '/' : '/login');
      router.refresh();
    } finally {
      setIngresando(false);
    }
  }

  return (
    <>
      <form onSubmit={enviar} aria-label="Crear cuenta">
        <label>
          Nombre completo
          <input name="nombre" required autoComplete="name" />
        </label>
        <label>
          Correo
          <input name="email" type="email" required autoComplete="email" />
        </label>
        <label>
          Teléfono (opcional)
          <input name="telefono" type="tel" autoComplete="tel" />
        </label>
        <label>
          Clave (mínimo 8)
          <input name="clave" type="password" required autoComplete="new-password" minLength={8} />
        </label>
        {error ? (
          <div role="alert" tabIndex={-1} ref={(el) => el?.focus()}>
            {error}
          </div>
        ) : null}
        <button type="submit" disabled={creando}>
          {creando ? 'Creando…' : 'Crear cuenta'}
        </button>
      </form>
      {exito ? (
        <div className="modal-fondo">
          <div className="modal" role="dialog" aria-modal="true" aria-labelledby="registro-exito">
            <h2 id="registro-exito">Cuenta creada con éxito</h2>
            <p>Tu cuenta está lista. Pulsa Aceptar para ingresar al sistema.</p>
            <button
              type="button"
              className="boton boton-primario"
              autoFocus
              disabled={ingresando}
              onClick={() => void aceptar()}
            >
              {ingresando ? 'Ingresando…' : 'Aceptar'}
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
