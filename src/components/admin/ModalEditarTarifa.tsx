'use client';

import type { FormEvent } from 'react';
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

type FormularioTarifa = { nombre: string; monto: string; horaInicio: string; horaFin: string; dias: number[] };

export function ModalEditarTarifa({
  horario,
  formulario,
  errorModal,
  guardando,
  onSubmit,
  onFormularioChange,
  onAlternarDia,
  onCancelar,
}: {
  horario: { apertura: string; cierre: string } | null;
  formulario: FormularioTarifa;
  errorModal: string | null;
  guardando: boolean;
  onSubmit: (evento: FormEvent<HTMLFormElement>) => void;
  onFormularioChange: (actualizar: (f: FormularioTarifa) => FormularioTarifa) => void;
  onAlternarDia: (dia: number) => void;
  onCancelar: () => void;
}) {
  return (
    <div className="modal-fondo">
      <div className="modal modal-amplio" role="dialog" aria-modal="true" aria-labelledby="editar-tarifa">
        <h2 id="editar-tarifa">Editar tarifa</h2>
        <p>
          Actualiza el nombre, el horario, los días y el monto.
          {horario ? ` Horario de atención: ${horario.apertura}–${horario.cierre}.` : ''}
        </p>
        <form onSubmit={onSubmit} aria-label="Guardar tarifa">
          <div className="rejilla-dos">
            <label>
              Nombre
              <input
                required
                maxLength={120}
                autoFocus
                value={formulario.nombre}
                onChange={(e) => onFormularioChange((f) => ({ ...f, nombre: e.target.value }))}
              />
            </label>
            <label>
              Monto (soles)
              <input
                inputMode="decimal"
                required
                value={formulario.monto}
                onChange={(e) => onFormularioChange((f) => ({ ...f, monto: e.target.value }))}
              />
            </label>
            <label>
              Desde
              <input
                type="time"
                required
                value={formulario.horaInicio}
                onChange={(e) => onFormularioChange((f) => ({ ...f, horaInicio: e.target.value }))}
              />
            </label>
            <label>
              Hasta
              <input
                type="time"
                required
                value={formulario.horaFin}
                onChange={(e) => onFormularioChange((f) => ({ ...f, horaFin: e.target.value }))}
              />
            </label>
          </div>
          <fieldset>
            <legend>Días</legend>
            {DIAS.map((d, i) => (
              <label key={d}>
                <input type="checkbox" checked={formulario.dias.includes(i)} onChange={() => onAlternarDia(i)} /> {d}
              </label>
            ))}
          </fieldset>
          {errorModal ? <p role="alert">{errorModal}</p> : null}
          <div className="acciones-panel">
            <button type="submit" className="boton boton-primario" disabled={guardando}>
              {guardando ? 'Guardando…' : 'Guardar cambios'}
            </button>
            <button type="button" className="boton boton-secundario" onClick={onCancelar}>
              Cancelar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
