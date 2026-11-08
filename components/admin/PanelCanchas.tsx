'use client';

import { FormEvent, useState } from 'react';

export type CanchaAdmin = {
  id: number;
  nombre: string;
  tarifaBaseCentavos: number;
  estado: 'DISPONIBLE' | 'NO_DISPONIBLE';
  motivoNoDisponible: string | null;
};

export type TarifaOpcion = {
  id: number;
  nombre: string;
  diasSemana: number[];
  horaInicio: string;
  horaFin: string;
  montoCentavos: number;
};

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function PanelCanchas({
  iniciales,
  tarifas,
  sedeId,
  soloLectura = false,
  sinEliminar = false,
}: {
  iniciales: CanchaAdmin[];
  tarifas: TarifaOpcion[];
  sedeId: string;
  soloLectura?: boolean;
  /** ADMIN: edita pero no elimina (el DELETE sigue siendo SUPERADMIN). */
  sinEliminar?: boolean;
}) {
  const [lista, setLista] = useState(iniciales);
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creando, setCreando] = useState(false);
  const [editando, setEditando] = useState<CanchaAdmin | null>(null);
  const [formulario, setFormulario] = useState({ nombre: '', tarifa: '', estado: 'DISPONIBLE', motivo: '' });
  const [errorModal, setErrorModal] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [eliminando, setEliminando] = useState<CanchaAdmin | null>(null);
  const [vista, setVista] = useState<{
    turnos: Array<{
      id: number;
      fecha: string;
      horaInicio: string;
      horaFin: string;
      estado: string;
      alternativas: Array<{ id: number; nombre: string; estado: string; libre: boolean }>;
    }>;
  } | null>(null);
  const [cargandoVista, setCargandoVista] = useState(false);
  const [errorEliminar, setErrorEliminar] = useState<string | null>(null);
  const [borrando, setBorrando] = useState(false);
  const [reasignaciones, setReasignaciones] = useState<
    Record<number, { destino: string; fecha: string; hora: string; libre: boolean | null; trabajando: boolean; error: string | null }>
  >({});

  async function recargar() {
    const actual = await fetch(`/api/canchas?sedeId=${sedeId}`, { cache: 'no-store' });
    if (actual.ok) setLista(((await actual.json()) as { canchas: CanchaAdmin[] }).canchas);
  }

  async function crear(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    const forma = evento.currentTarget;
    setMensaje(null);
    setError(null);
    setCreando(true);
    try {
      const datos = new FormData(forma);
      const r = await fetch('/api/canchas', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sedeId: Number(sedeId),
          nombre: String(datos.get('nombre') ?? '').trim(),
          tarifaBaseCentavos: Math.round(Number(datos.get('tarifa')) * 100),
        }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo crear la cancha');
      await recargar();
      setMensaje('Cancha creada correctamente.');
      forma.reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setCreando(false);
    }
  }

  function abrirEdicion(cancha: CanchaAdmin) {
    setEditando(cancha);
    setFormulario({
      nombre: cancha.nombre,
      tarifa: String(cancha.tarifaBaseCentavos / 100),
      estado: cancha.estado,
      motivo: cancha.motivoNoDisponible ?? '',
    });
    setErrorModal(null);
    setMensaje(null);
    setError(null);
  }

  function usarTarifaExistente(id: string) {
    const tarifa = tarifas.find((t) => String(t.id) === id);
    if (tarifa) setFormulario((f) => ({ ...f, tarifa: String(tarifa.montoCentavos / 100) }));
  }

  async function guardar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!editando) return;
    setErrorModal(null);
    setGuardando(true);
    try {
      const r = await fetch(`/api/canchas/${editando.id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          nombre: formulario.nombre.trim(),
          tarifaBaseCentavos: Math.round(Number(formulario.tarifa) * 100),
          estado: formulario.estado,
          motivoNoDisponible: formulario.estado === 'NO_DISPONIBLE' ? formulario.motivo.trim() : null,
        }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo actualizar la cancha');
      await recargar();
      setEditando(null);
      setMensaje('Cancha actualizada correctamente.');
    } catch (e) {
      setErrorModal(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setGuardando(false);
    }
  }

  async function cargarVista(cancha: CanchaAdmin) {
    setCargandoVista(true);
    setErrorEliminar(null);
    try {
      const r = await fetch(`/api/canchas/${cancha.id}/eliminacion`, { cache: 'no-store' });
      const j = (await r.json().catch(() => null)) as {
        error?: string;
        turnos?: Array<{ id: number; fecha: string; horaInicio: string; alternativas: Array<{ id: number }> }>;
      } | null;
      if (!r.ok || !j) throw new Error(j?.error ?? 'No se pudo revisar la cancha');
      setVista(j as NonNullable<typeof vista>);
      const inicial: typeof reasignaciones = {};
      for (const turno of j.turnos ?? []) {
        inicial[turno.id] = {
          destino: '',
          fecha: turno.fecha,
          hora: turno.horaInicio,
          libre: null,
          trabajando: false,
          error: null,
        };
      }
      setReasignaciones(inicial);
    } catch (e) {
      setErrorEliminar(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
    } finally {
      setCargandoVista(false);
    }
  }

  function abrirEliminacion(cancha: CanchaAdmin) {
    setEliminando(cancha);
    setVista(null);
    setErrorEliminar(null);
    setMensaje(null);
    setError(null);
    void cargarVista(cancha);
  }

  function actualizarReasignacion(id: number, cambios: Partial<(typeof reasignaciones)[number]>) {
    setReasignaciones((r) => ({ ...r, [id]: { ...r[id], ...cambios, ...(cambios.destino !== undefined || cambios.fecha !== undefined || cambios.hora !== undefined ? { libre: null, error: null } : {}) } }));
  }

  async function verificar(turnoId: number, mover: boolean) {
    if (!eliminando) return;
    const seleccion = reasignaciones[turnoId];
    if (!seleccion?.destino) {
      actualizarReasignacion(turnoId, { error: 'Elige la cancha destino' });
      return;
    }
    actualizarReasignacion(turnoId, { trabajando: true, error: null });
    try {
      const r = await fetch(`/api/canchas/${eliminando.id}/reasignar`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          solicitudId: turnoId,
          canchaDestinoId: Number(seleccion.destino),
          fecha: seleccion.fecha,
          horaInicio: seleccion.hora,
          ...(mover ? {} : { verificar: true }),
        }),
      });
      const j = (await r.json().catch(() => null)) as { error?: string; libre?: boolean } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo validar el destino');
      if (mover) {
        await cargarVista(eliminando);
        await recargar();
        setMensaje('Turno reasignado correctamente.');
      } else {
        actualizarReasignacion(turnoId, { libre: j?.libre ?? false });
      }
    } catch (e) {
      actualizarReasignacion(turnoId, { error: e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo' });
    } finally {
      actualizarReasignacion(turnoId, { trabajando: false });
    }
  }

  async function eliminar() {
    if (!eliminando) return;
    setErrorEliminar(null);
    setBorrando(true);
    try {
      const r = await fetch(`/api/canchas/${eliminando.id}`, { method: 'DELETE' });
      const j = (await r.json().catch(() => null)) as { error?: string } | null;
      if (!r.ok) throw new Error(j?.error ?? 'No se pudo eliminar la cancha');
      await recargar();
      setEliminando(null);
      setMensaje('Cancha eliminada correctamente.');
    } catch (e) {
      setErrorEliminar(e instanceof Error ? e.message : 'Revisa tu conexión e inténtalo de nuevo');
      if (eliminando) await cargarVista(eliminando);
    } finally {
      setBorrando(false);
    }
  }

  return (
    <>
      {soloLectura ? <p role="status">Vista de lectura: la gestión de canchas corresponde al superadmin.</p> : null}
      {!soloLectura ? (
      <form onSubmit={crear} aria-label="Crear cancha">
        <h2>Nueva cancha</h2>
        <p>Registra el nombre comercial y su tarifa base por hora.</p>
        <div className="rejilla-dos">
          <label>
            Nombre
            <input name="nombre" required maxLength={120} />
          </label>
          <label>
            Tarifa base (soles/hora)
            <input name="tarifa" inputMode="decimal" required />
          </label>
        </div>
        <div className="acciones-panel">
          <button type="submit" className="boton boton-primario" disabled={creando}>
            {creando ? 'Creando…' : 'Crear cancha'}
          </button>
        </div>
      </form>
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
      <section className="panel" aria-label="Canchas de la sede">
        <div className="encabezado-panel">
          <h2>Canchas</h2>
          <p>{lista.length === 0 ? 'Esta sede todavía no tiene canchas.' : `${lista.length} cancha${lista.length === 1 ? '' : 's'} registradas.`}</p>
        </div>
        {lista.length === 0 ? (
          <p role="status">Sin canchas en esta sede.</p>
        ) : (
          <ul className="lista-gestion">
            {lista.map((c) => (
              <li key={c.id} className="fila-gestion">
                <div>
                  <strong>
                    {c.nombre}{' '}
                    <span className={`estado-cancha ${c.estado === 'DISPONIBLE' ? 'estado-disponible' : 'estado-no-disponible'}`}>
                      {c.estado === 'DISPONIBLE' ? 'Disponible' : 'No disponible'}
                    </span>
                  </strong>
                  <span>
                    {c.estado === 'DISPONIBLE'
                      ? `${soles.format(c.tarifaBaseCentavos / 100)} por hora`
                      : (c.motivoNoDisponible ?? 'No disponible')}
                  </span>
                </div>
                {!soloLectura ? (
                  <div className="botones-fila">
                    <button type="button" className="boton boton-secundario" onClick={() => abrirEdicion(c)}>
                      Editar
                    </button>
                    {!sinEliminar ? (
                      <button type="button" className="boton boton-peligro" onClick={() => abrirEliminacion(c)}>
                        Eliminar
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>
      {eliminando ? (
        <div className="modal-fondo">
          <div className="modal modal-amplio" role="dialog" aria-modal="true" aria-labelledby="eliminar-cancha">
            <h2 id="eliminar-cancha">Eliminar {eliminando.nombre}</h2>
            {cargandoVista ? <p role="status">Revisando los turnos asignados…</p> : null}
            {errorEliminar ? <p role="alert">{errorEliminar}</p> : null}
            {vista && vista.turnos.length > 0 ? (
              <>
                <p role="alert">
                  Esta cancha tiene {vista.turnos.length} turno{vista.turnos.length === 1 ? '' : 's'} futuros. Reasigna cada turno antes de eliminarla.
                </p>
                {vista.turnos.map((turno) => {
                  const seleccion = reasignaciones[turno.id];
                  return (
                    <section key={turno.id} className="turno-reasignacion" aria-label={`Turno ${turno.fecha} ${turno.horaInicio}`}>
                      <h3>
                        {turno.fecha} · {turno.horaInicio}–{turno.horaFin} · {turno.estado}
                      </h3>
                      <ul className="lista-gestion">
                        {turno.alternativas.map((a) => (
                          <li key={a.id} className="fila-gestion">
                            <div>
                              <strong>{a.nombre}</strong>
                              <span>{a.estado === 'DISPONIBLE' ? (a.libre ? 'Libre en este turno' : 'Ocupada en este turno') : 'No disponible'}</span>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="rejilla-dos">
                        <label>
                          Otra cancha
                          <select
                            value={seleccion?.destino ?? ''}
                            onChange={(e) => actualizarReasignacion(turno.id, { destino: e.target.value })}
                          >
                            <option value="">Seleccionar cancha…</option>
                            {turno.alternativas
                              .filter((a) => a.estado === 'DISPONIBLE')
                              .map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.nombre}
                                </option>
                              ))}
                          </select>
                        </label>
                        <label>
                          Fecha
                          <input
                            type="date"
                            required
                            value={seleccion?.fecha ?? turno.fecha}
                            onChange={(e) => actualizarReasignacion(turno.id, { fecha: e.target.value })}
                          />
                        </label>
                        <label>
                          Hora
                          <input
                            type="time"
                            step={3600}
                            required
                            value={seleccion?.hora ?? turno.horaInicio}
                            onChange={(e) => actualizarReasignacion(turno.id, { hora: e.target.value })}
                          />
                        </label>
                      </div>
                      {seleccion?.error ? <p role="alert">{seleccion.error}</p> : null}
                      {seleccion?.libre != null ? (
                        <p role="status">{seleccion.libre ? 'Destino disponible.' : 'Destino ocupado.'}</p>
                      ) : null}
                      <div className="acciones-panel">
                        <button
                          type="button"
                          className="boton boton-secundario"
                          disabled={seleccion?.trabajando}
                          onClick={() => void verificar(turno.id, false)}
                        >
                          {seleccion?.trabajando ? 'Verificando…' : 'Verificar'}
                        </button>
                        <button
                          type="button"
                          className="boton boton-primario"
                          disabled={seleccion?.trabajando}
                          onClick={() => void verificar(turno.id, true)}
                        >
                          {seleccion?.trabajando ? 'Reasignando…' : 'Reasignar turno'}
                        </button>
                      </div>
                    </section>
                  );
                })}
              </>
            ) : null}
            {vista && vista.turnos.length === 0 ? (
              <p>La cancha quedará desactivada, pero su historial se conserva.</p>
            ) : null}
            <div className="acciones-panel">
              <button
                type="button"
                className="boton boton-peligro"
                disabled={borrando || cargandoVista || (vista?.turnos.length ?? 1) > 0}
                onClick={() => void eliminar()}
              >
                {borrando ? 'Eliminando…' : 'Eliminar cancha'}
              </button>
              <button type="button" className="boton boton-secundario" onClick={() => setEliminando(null)}>
                Cancelar
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {editando ? (
        <div className="modal-fondo">
          <div className="modal modal-amplio" role="dialog" aria-modal="true" aria-labelledby="editar-cancha">
            <h2 id="editar-cancha">Editar cancha</h2>
            <p>Actualiza el nombre, la tarifa base y la disponibilidad operativa.</p>
            <form onSubmit={guardar} aria-label="Guardar cancha">
              <label>
                Nombre
                <input
                  name="nombre"
                  required
                  maxLength={120}
                  autoFocus
                  value={formulario.nombre}
                  onChange={(e) => setFormulario((f) => ({ ...f, nombre: e.target.value }))}
                />
              </label>
              <div className="rejilla-dos">
                <label>
                  Tarifa base (soles/hora)
                  <input
                    name="tarifa"
                    inputMode="decimal"
                    required
                    value={formulario.tarifa}
                    onChange={(e) => setFormulario((f) => ({ ...f, tarifa: e.target.value }))}
                  />
                </label>
                <label>
                  Usar tarifa existente
                  <select defaultValue="" onChange={(e) => usarTarifaExistente(e.target.value)}>
                    <option value="">Seleccionar tarifa…</option>
                    {tarifas.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.nombre} · {t.diasSemana.map((d) => DIAS[d]).join(', ')} · {soles.format(t.montoCentavos / 100)}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="rejilla-dos">
                <label>
                  Estado
                  <select
                    value={formulario.estado}
                    onChange={(e) =>
                      setFormulario((f) => ({
                        ...f,
                        estado: e.target.value as 'DISPONIBLE' | 'NO_DISPONIBLE',
                        motivo: e.target.value === 'DISPONIBLE' ? '' : f.motivo,
                      }))
                    }
                  >
                    <option value="DISPONIBLE">Disponible</option>
                    <option value="NO_DISPONIBLE">No disponible</option>
                  </select>
                </label>
                <label>
                  Motivo de no disponibilidad
                  <input
                    value={formulario.motivo}
                    required={formulario.estado === 'NO_DISPONIBLE'}
                    disabled={formulario.estado === 'DISPONIBLE'}
                    maxLength={200}
                    onChange={(e) => setFormulario((f) => ({ ...f, motivo: e.target.value }))}
                  />
                </label>
              </div>
              {tarifas.length === 0 ? (
                <p role="status">Esta sede aún no tiene tarifas vigentes: la cancha quedará no disponible.</p>
              ) : null}
              {errorModal ? <p role="alert">{errorModal}</p> : null}
              <div className="acciones-panel">
                <button type="submit" className="boton boton-primario" disabled={guardando}>
                  {guardando ? 'Guardando…' : 'Guardar cambios'}
                </button>
                <button type="button" className="boton boton-secundario" onClick={() => setEditando(null)}>
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}
    </>
  );
}
