import type { FormEvent } from 'react';
import type { FormularioCancha, TarifaOpcion } from './panel-canchas-types';

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function PanelCanchasModalEdicion({
  abierta,
  formulario,
  tarifas,
  errorModal,
  guardando,
  setFormulario,
  usarTarifaExistente,
  guardar,
  cerrar,
}: {
  abierta: boolean;
  formulario: FormularioCancha;
  tarifas: TarifaOpcion[];
  errorModal: string | null;
  guardando: boolean;
  setFormulario: (actualizar: (f: FormularioCancha) => FormularioCancha) => void;
  usarTarifaExistente: (id: string) => void;
  guardar: (evento: FormEvent<HTMLFormElement>) => void;
  cerrar: () => void;
}) {
  if (!abierta) return null;
  return (
    <div className="modal-fondo">
      <div className="modal modal-amplio" role="dialog" aria-modal="true" aria-labelledby="editar-cancha">
        <h2 id="editar-cancha">Editar cancha</h2>
        <p>Actualiza el nombre, la tarifa base y la disponibilidad operativa.</p>
        <form onSubmit={guardar} aria-label="Guardar cancha">
          <label>
            Nombre
            <input name="nombre" required maxLength={120} autoFocus value={formulario.nombre} onChange={(e) => setFormulario((f) => ({ ...f, nombre: e.target.value }))} />
          </label>
          <div className="rejilla-dos">
            <label>
              Tarifa base (soles/hora)
              <input name="tarifa" inputMode="decimal" required value={formulario.tarifa} onChange={(e) => setFormulario((f) => ({ ...f, tarifa: e.target.value }))} />
            </label>
            <label>
              Usar tarifa existente
              <select defaultValue="" onChange={(e) => usarTarifaExistente(e.target.value)}>
                <option value="">Seleccionar tarifa…</option>
                {tarifas.map((t) => <option key={t.id} value={t.id}>{t.nombre} · {t.diasSemana.map((d) => DIAS[d]).join(', ')} · {soles.format(t.montoCentavos / 100)}</option>)}
              </select>
            </label>
          </div>
          <div className="rejilla-dos">
            <label>
              Estado
              <select value={formulario.estado} onChange={(e) => setFormulario((f) => ({ ...f, estado: e.target.value as 'DISPONIBLE' | 'NO_DISPONIBLE', motivo: e.target.value === 'DISPONIBLE' ? '' : f.motivo }))}>
                <option value="DISPONIBLE">Disponible</option>
                <option value="NO_DISPONIBLE">No disponible</option>
              </select>
            </label>
            <label>
              Motivo de no disponibilidad
              <input value={formulario.motivo} required={formulario.estado === 'NO_DISPONIBLE'} disabled={formulario.estado === 'DISPONIBLE'} maxLength={200} onChange={(e) => setFormulario((f) => ({ ...f, motivo: e.target.value }))} />
            </label>
          </div>
          {tarifas.length === 0 ? <p role="status">Esta sede aún no tiene tarifas vigentes: la cancha quedará no disponible.</p> : null}
          {errorModal ? <p role="alert">{errorModal}</p> : null}
          <div className="acciones-panel">
            <button type="submit" className="boton boton-primario" disabled={guardando}>{guardando ? 'Guardando…' : 'Guardar cambios'}</button>
            <button type="button" className="boton boton-secundario" onClick={cerrar}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
