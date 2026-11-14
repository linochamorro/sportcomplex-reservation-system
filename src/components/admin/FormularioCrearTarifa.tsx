'use client';

import type { FormEvent } from 'react';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function FormularioCrearTarifa({
  horario,
  creando,
  onSubmit,
}: {
  horario: { apertura: string; cierre: string } | null;
  creando: boolean;
  onSubmit: (evento: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form onSubmit={onSubmit} aria-label="Crear tarifa">
      <h2>Nueva tarifa</h2>
      <p>
        Combina días, horario y monto para esta sede.
        {horario ? ` Horario de atención: ${horario.apertura}–${horario.cierre}.` : ''}
      </p>
      <div className="rejilla-dos">
        <label>
          Nombre
          <input name="nombre" required maxLength={120} />
        </label>
        <label>
          Monto (soles)
          <input name="monto" inputMode="decimal" required />
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
      <fieldset>
        <legend>Días</legend>
        {DIAS.map((d, i) => (
          <label key={d}>
            <input name={`dia-${i}`} type="checkbox" /> {d}
          </label>
        ))}
      </fieldset>
      <div className="acciones-panel">
        <button type="submit" className="boton boton-primario" disabled={creando}>
          {creando ? 'Creando…' : 'Crear tarifa'}
        </button>
      </div>
    </form>
  );
}
