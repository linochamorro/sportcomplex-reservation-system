'use client';

import { FormEvent, useState } from 'react';

export type Bloqueo = { id: number; canchaId: number; fecha: string; horaInicio: string; horaFin: string; motivo: string };

export function PanelBloqueos({
  iniciales,
  sedeId,
  canchas,
}: {
  iniciales: Bloqueo[];
  sedeId: string;
  canchas: Array<{ id: number; nombre: string }>;
}) {
  const [lista, setLista] = useState(iniciales);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const porCancha = new Map(canchas.map((c) => [c.id, c.nombre]));

  async function crear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const formulario = evento.currentTarget;
    setMensaje(null);
    setError(null);
    setCreando(true);
    try {
      const datos = new FormData(formulario);
      const r = await fetch('/api/bloqueos', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          canchaId: Number(datos.get('canchaId')),
          fecha: datos.get('fecha'),
          horaInicio: datos.get('horaInicio'),
          horaFin: datos.get('horaFin'),
          motivo: String(datos.get('motivo') ?? '').trim(),
        }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo crear el bloqueo');
      const actual = await fetch(`/api/bloqueos?sedeId=${sedeId}`, { cache: 'no-store' });
      if (actual.ok) setLista(((await actual.json()) as { bloqueos: Bloqueo[] }).bloqueos);
      setMensaje('Cancha bloqueada correctamente.');
      formulario.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setCreando(false);
    }
  }

  return (
    <>
      <form onSubmit={crear} aria-label="Crear bloqueo">
        <h2>Nuevo mantenimiento</h2>
        <p>Solo puedes bloquear canchas disponibles de tu sede asignada.</p>
        <div className="rejilla-dos">
          <label>
            Cancha
            <select name="canchaId" required defaultValue="">
              <option value="">Seleccionar cancha…</option>
              {canchas.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nombre}
                </option>
              ))}
            </select>
          </label>
          <label>
            Fecha
            <input name="fecha" type="date" required />
          </label>
          <label>
            Desde
            <input name="horaInicio" type="time" required />
          </label>
          <label>
            Hasta
            <input name="horaFin" type="time" required />
          </label>
        </div>
        <label>
          Motivo
          <input name="motivo" required maxLength={500} />
        </label>
        <div className="acciones-panel">
          <button type="submit" className="boton boton-primario" disabled={creando}>
            {creando ? 'Bloqueando…' : 'Bloquear'}
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
      <section className="panel" aria-label="Mantenimientos registrados">
        <div className="encabezado-panel">
          <h2>Mantenimientos</h2>
          <p>{lista.length === 0 ? 'No hay bloqueos activos.' : `${lista.length} bloqueo${lista.length === 1 ? '' : 's'} registrados.`}</p>
        </div>
        {lista.length === 0 ? (
          <p role="status">Sin bloqueos.</p>
        ) : (
          <ul className="lista-gestion">
            {lista.map((b) => (
              <li key={b.id} className="fila-gestion">
                <div>
                  <strong>{porCancha.get(b.canchaId) ?? `Cancha ${b.canchaId}`}</strong>
                  <span>
                    {b.fecha} · {b.horaInicio}–{b.horaFin} · {b.motivo}
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
