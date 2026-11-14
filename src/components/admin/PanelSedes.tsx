'use client';

import { FormEvent, useState } from 'react';

export type Sede = { id: number; nombre: string; direccion: string | null; apertura: string; cierre: string; esPrueba?: boolean };

export function PanelSedes({ iniciales }: { iniciales: Sede[] }) {
  const [lista, setLista] = useState(iniciales);
  const [editando, setEditando] = useState<Sede | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState<number | null>(null);
  const [trabajando, setTrabajando] = useState<string | null>(null);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function recargar() {
    const actual = await fetch('/api/sedes', { cache: 'no-store' });
    if (actual.ok) setLista(((await actual.json()) as { sedes: Sede[] }).sedes);
  }

  function datos(formulario: FormData) {
    return {
      nombre: String(formulario.get('nombre') ?? '').trim(),
      direccion: String(formulario.get('direccion') ?? '').trim() || null,
      apertura: String(formulario.get('apertura') ?? ''),
      cierre: String(formulario.get('cierre') ?? ''),
    };
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    setMensaje(null);
    setError(null);
    setTrabajando(editando ? `editar-${editando.id}` : 'crear');
    try {
      const r = await fetch(editando ? `/api/sedes/${editando.id}` : '/api/sedes', {
        method: editando ? 'PUT' : 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(datos(new FormData(formulario))),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo guardar la sede');
      await recargar();
      setMensaje(editando ? 'Sede actualizada correctamente.' : 'Sede creada correctamente.');
      setEditando(null);
      formulario.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setTrabajando(null);
    }
  }

  async function eliminar(sede: Sede) {
    if (confirmarEliminar !== sede.id) {
      setConfirmarEliminar(sede.id);
      return;
    }
    setMensaje(null);
    setError(null);
    setTrabajando(`eliminar-${sede.id}`);
    try {
      const r = await fetch(`/api/sedes/${sede.id}`, { method: 'DELETE' });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo eliminar la sede');
      await recargar();
      setMensaje('Sede eliminada correctamente.');
      if (editando?.id === sede.id) setEditando(null);
      setConfirmarEliminar(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setTrabajando(null);
    }
  }

  return (
    <>
      <form onSubmit={guardar} aria-label={editando ? 'Editar sede' : 'Crear sede'}>
        <h2>{editando ? `Editar ${editando.nombre}` : 'Nueva sede'}</h2>
        <p>Define el nombre visible, su dirección y el horario operativo.</p>
        <div className="rejilla-dos" key={editando?.id ?? 'nueva'}>
          <label>
            Nombre
            <input name="nombre" required maxLength={120} defaultValue={editando?.nombre ?? ''} />
          </label>
          <label>
            Dirección
            <input name="direccion" maxLength={200} defaultValue={editando?.direccion ?? ''} />
          </label>
          <label>
            Apertura
            <input name="apertura" type="time" required defaultValue={editando?.apertura ?? ''} />
          </label>
          <label>
            Cierre
            <input name="cierre" type="time" required defaultValue={editando?.cierre ?? ''} />
          </label>
        </div>
        <div className="acciones-panel">
          <button type="submit" className="boton boton-primario" disabled={trabajando !== null}>
            {trabajando === 'crear' || trabajando?.startsWith('editar-')
              ? 'Guardando…'
              : editando
                ? 'Guardar cambios'
                : 'Crear sede'}
          </button>
          {editando ? (
            <button type="button" className="boton boton-secundario" onClick={() => setEditando(null)}>
              Cancelar
            </button>
          ) : null}
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
      <section className="panel" aria-label="Sedes registradas">
        <div className="encabezado-panel">
          <h2>Sedes registradas</h2>
          <p>{lista.length === 0 ? 'Todavía no hay sedes.' : `${lista.length} sede${lista.length === 1 ? '' : 's'} activas.`}</p>
        </div>
        {lista.length === 0 ? (
          <p role="status">Sin sedes.</p>
        ) : (
          <ul className="lista-gestion">
            {lista.map((s) => (
              <li key={s.id} className="fila-gestion">
                <div>
                  <strong>
                    {s.nombre}
                    {s.esPrueba ? <span className="estado-cancha estado-no-disponible">Prueba</span> : null}
                  </strong>
                  <span>
                    {s.direccion ? `${s.direccion} · ` : ''}
                    {s.apertura}–{s.cierre}
                    {s.esPrueba ? ' · no aparece en el catálogo de reservas' : ''}
                  </span>
                </div>
                <div className="botones-fila">
                  <button
                    type="button"
                    className="boton boton-secundario"
                    onClick={() => {
                      setEditando(s);
                      setConfirmarEliminar(null);
                      setMensaje(null);
                      setError(null);
                    }}
                  >
                    Editar
                  </button>
                  {confirmarEliminar === s.id ? (
                    <>
                      <button
                        type="button"
                        className="boton boton-peligro"
                        disabled={trabajando !== null}
                        onClick={() => void eliminar(s)}
                      >
                        {trabajando === `eliminar-${s.id}` ? 'Eliminando…' : 'Confirmar'}
                      </button>
                      <button type="button" className="boton boton-secundario" onClick={() => setConfirmarEliminar(null)}>
                        Cancelar
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="boton boton-peligro"
                      onClick={() => {
                        setConfirmarEliminar(s.id);
                        setMensaje(null);
                        setError(null);
                      }}
                    >
                      Eliminar
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
