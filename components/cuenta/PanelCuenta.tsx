'use client';

import { FormEvent, useState } from 'react';

export type Cuenta = {
  email: string;
  nombre: string;
  telefono: string | null;
  rol: string;
  sedeNombre: string | null;
};

export function PanelCuenta({ inicial }: { inicial: Cuenta }) {
  const [cuenta, setCuenta] = useState(inicial);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardandoPerfil, setGuardandoPerfil] = useState(false);
  const [guardandoClave, setGuardandoClave] = useState(false);
  const [claveAbierta, setClaveAbierta] = useState(false);
  const [errorClave, setErrorClave] = useState<string | null>(null);

  async function guardarPerfil(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    setMensaje(null);
    setError(null);
    setGuardandoPerfil(true);
    try {
      const datos = new FormData(formulario);
      const r = await fetch('/api/cuenta/perfil', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ nombre: datos.get('nombre'), telefono: datos.get('telefono') }),
      });
      const j = (await r.json().catch(() => null)) as (Cuenta & { error?: string }) | null;
      if (!r.ok || !j) throw new Error(j?.error ?? 'No se pudo actualizar la cuenta');
      setCuenta(j);
      setMensaje('Cuenta actualizada correctamente.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setGuardandoPerfil(false);
    }
  }

  async function cambiarClave(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    setMensaje(null);
    setErrorClave(null);
    setGuardandoClave(true);
    try {
      const datos = new FormData(formulario);
      if (String(datos.get('nueva') ?? '') !== String(datos.get('confirmar') ?? '')) {
        throw new Error('La confirmación no coincide con la nueva clave');
      }
      const r = await fetch('/api/cuenta/clave', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actual: datos.get('actual'), nueva: datos.get('nueva') }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo cambiar la clave');
      setMensaje('Clave actualizada correctamente.');
      formulario.reset();
      setClaveAbierta(false);
    } catch (e) {
      setErrorClave(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setGuardandoClave(false);
    }
  }

  return (
    <>
      <section className="panel panel-igual" aria-label="Datos de la cuenta">
        <div className="encabezado-panel">
          <h2>Mi cuenta</h2>
          <p>
            {cuenta.rol}
            {cuenta.sedeNombre ? ` · ${cuenta.sedeNombre}` : ''}
          </p>
        </div>
        <p>
          <strong>Correo:</strong> {cuenta.email}
        </p>
      </section>
      <form onSubmit={guardarPerfil} aria-label="Editar cuenta">
        <h2>Editar</h2>
        <p>Actualiza el nombre visible y tu teléfono de contacto.</p>
        <div className="rejilla-dos" key={`${cuenta.nombre}-${cuenta.telefono ?? ''}`}>
          <label>
            Nombre completo
            <input name="nombre" required minLength={2} maxLength={120} defaultValue={cuenta.nombre} autoComplete="name" />
          </label>
          <label>
            Teléfono
            <input name="telefono" type="tel" maxLength={30} defaultValue={cuenta.telefono ?? ''} autoComplete="tel" />
          </label>
        </div>
        <div className="acciones-panel">
          <button type="submit" className="boton boton-primario" disabled={guardandoPerfil}>
            {guardandoPerfil ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>
      <div className="acciones-panel">
        <button
          type="button"
          className="boton boton-secundario"
          onClick={() => {
            setErrorClave(null);
            setClaveAbierta(true);
          }}
        >
          Cambiar clave
        </button>
      </div>
      {claveAbierta ? (
        <div className="modal-fondo">
          <div className="modal modal-amplio" role="dialog" aria-modal="true" aria-labelledby="cambiar-clave">
            <h2 id="cambiar-clave">Cambiar clave</h2>
            <p>Por seguridad, confirma tu clave actual antes de definir la nueva.</p>
            <form onSubmit={cambiarClave} aria-label="Cambiar clave">
              <label>
                Clave actual
                <input name="actual" type="password" required autoComplete="current-password" autoFocus />
              </label>
              <div className="rejilla-dos">
                <label>
                  Nueva clave
                  <input name="nueva" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
                </label>
                <label>
                  Confirmar nueva clave
                  <input name="confirmar" type="password" required minLength={8} maxLength={128} autoComplete="new-password" />
                </label>
              </div>
              {errorClave ? <p role="alert">{errorClave}</p> : null}
              <div className="acciones-panel">
                <button type="submit" className="boton boton-primario" disabled={guardandoClave}>
                  {guardandoClave ? 'Guardando…' : 'Guardar nueva clave'}
                </button>
                <button type="button" className="boton boton-secundario" onClick={() => setClaveAbierta(false)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
      {error ? (
        <div className="mensaje mensaje-error" role="alert" tabIndex={-1} ref={(el) => el?.focus()}>
          {error}
        </div>
      ) : null}
      {mensaje ? (
        <div className="mensaje mensaje-exito" role="status">
          {mensaje}
        </div>
      ) : null}
    </>
  );
}
