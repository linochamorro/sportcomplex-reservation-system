'use client';

import { FormEvent, useState } from 'react';

export type UsuarioAdmin = { id: number; email: string; nombre: string; rol: string; sedeId: number | null };

export function PanelUsuarios({
  iniciales,
  sedes,
}: {
  iniciales: UsuarioAdmin[];
  sedes: Array<{ id: number; nombre: string }>;
}) {
  const [lista, setLista] = useState(iniciales.filter((u) => u.rol !== 'USUARIO'));
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);

  async function crear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    setMensaje(null);
    setError(null);
    setCreando(true);
    try {
      const datos = new FormData(formulario);
      const r = await fetch('/api/usuarios', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: String(datos.get('email') ?? '').trim(),
          clave: datos.get('clave'),
          nombre: String(datos.get('nombre') ?? '').trim(),
          rol: 'ADMIN',
          sedeId: datos.get('sedeId') ? Number(datos.get('sedeId')) : null,
        }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo crear el usuario');
      const actual = await fetch('/api/usuarios', { cache: 'no-store' });
      if (actual.ok) {
        setLista(((await actual.json()) as { usuarios: UsuarioAdmin[] }).usuarios.filter((u) => u.rol !== 'USUARIO'));
      }
      setMensaje('Administrador creado correctamente.');
      formulario.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setCreando(false);
    }
  }

  return (
    <>
      <form onSubmit={crear} aria-label="Crear administrador">
        <h2>Nuevo administrador</h2>
        <p>Esta sección solo crea cuentas con rol Administrador.</p>
        <div className="rejilla-dos">
          <label>
            Correo
            <input name="email" type="email" required autoComplete="email" />
          </label>
          <label>
            Nombre
            <input name="nombre" required maxLength={120} autoComplete="name" />
          </label>
          <label>
            Clave
            <input name="clave" type="password" required minLength={8} autoComplete="new-password" />
          </label>
          <div>
            <strong>Rol</strong>
            <p>Administrador</p>
          </div>
        </div>
        <label>
          Sede del administrador
          <select name="sedeId" required>
            <option value="">Seleccionar sede…</option>
            {sedes.map((s) => (
              <option key={s.id} value={s.id}>
                {s.nombre}
              </option>
            ))}
          </select>
        </label>
        <div className="acciones-panel">
          <button type="submit" className="boton boton-primario" disabled={creando}>
            {creando ? 'Creando…' : 'Crear administrador'}
          </button>
        </div>
      </form>
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
      <section className="panel panel-igual" aria-label="Administradores registrados">
        <div className="encabezado-panel">
          <h2>Administradores</h2>
          <p>{lista.length === 0 ? 'Todavía no hay usuarios.' : `${lista.length} cuenta${lista.length === 1 ? '' : 's'} registradas.`}</p>
        </div>
        {lista.length === 0 ? (
          <p role="status">Sin usuarios.</p>
        ) : (
          <ul className="lista-gestion">
            {lista.map((u) => (
              <li key={u.id} className="fila-gestion">
                <div>
                  <strong>{u.nombre}</strong>
                  <span>
                    {u.email} · {u.rol}
                    {u.sedeId ? ` · sede ${sedes.find((s) => s.id === u.sedeId)?.nombre ?? u.sedeId}` : ''}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
