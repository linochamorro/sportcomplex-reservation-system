import type { CanchaAdmin, Reasignacion, VistaEliminacion } from './panel-canchas-types';

export function PanelCanchasModalEliminacion({
  eliminando,
  vista,
  cargandoVista,
  errorEliminar,
  reasignaciones,
  borrando,
  actualizarReasignacion,
  verificar,
  eliminar,
  cerrar,
}: {
  eliminando: CanchaAdmin | null;
  vista: VistaEliminacion | null;
  cargandoVista: boolean;
  errorEliminar: string | null;
  reasignaciones: Record<number, Reasignacion>;
  borrando: boolean;
  actualizarReasignacion: (id: number, cambios: Partial<Reasignacion>) => void;
  verificar: (turnoId: number, mover: boolean) => void;
  eliminar: () => void;
  cerrar: () => void;
}) {
  if (!eliminando) return null;
  return (
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
                  <h3>{turno.fecha} · {turno.horaInicio}–{turno.horaFin} · {turno.estado}</h3>
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
                      <select value={seleccion?.destino ?? ''} onChange={(e) => actualizarReasignacion(turno.id, { destino: e.target.value })}>
                        <option value="">Seleccionar cancha…</option>
                        {turno.alternativas.filter((a) => a.estado === 'DISPONIBLE').map((a) => (
                          <option key={a.id} value={a.id}>{a.nombre}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Fecha
                      <input type="date" required value={seleccion?.fecha ?? turno.fecha} onChange={(e) => actualizarReasignacion(turno.id, { fecha: e.target.value })} />
                    </label>
                    <label>
                      Hora
                      <input type="time" step={3600} required value={seleccion?.hora ?? turno.horaInicio} onChange={(e) => actualizarReasignacion(turno.id, { hora: e.target.value })} />
                    </label>
                  </div>
                  {seleccion?.error ? <p role="alert">{seleccion.error}</p> : null}
                  {seleccion?.libre != null ? <p role="status">{seleccion.libre ? 'Destino disponible.' : 'Destino ocupado.'}</p> : null}
                  <div className="acciones-panel">
                    <button type="button" className="boton boton-secundario" disabled={seleccion?.trabajando} onClick={() => verificar(turno.id, false)}>
                      {seleccion?.trabajando ? 'Verificando…' : 'Verificar'}
                    </button>
                    <button type="button" className="boton boton-primario" disabled={seleccion?.trabajando} onClick={() => verificar(turno.id, true)}>
                      {seleccion?.trabajando ? 'Reasignando…' : 'Reasignar turno'}
                    </button>
                  </div>
                </section>
              );
            })}
          </>
        ) : null}
        {vista && vista.turnos.length === 0 ? <p>La cancha quedará desactivada, pero su historial se conserva.</p> : null}
        <div className="acciones-panel">
          <button type="button" className="boton boton-peligro" disabled={borrando || cargandoVista || (vista?.turnos.length ?? 1) > 0} onClick={eliminar}>
            {borrando ? 'Eliminando…' : 'Eliminar cancha'}
          </button>
          <button type="button" className="boton boton-secundario" onClick={cerrar}>Cancelar</button>
        </div>
      </div>
    </div>
  );
}
