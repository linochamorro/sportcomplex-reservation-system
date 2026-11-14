import type { FormEvent } from 'react';

export function PanelCanchasFormularioCreacion({ creando, crear }: { creando: boolean; crear: (evento: FormEvent<HTMLFormElement>) => void }) {
  return (
    <form onSubmit={crear} aria-label="Crear cancha">
      <h2>Nueva cancha</h2>
      <p>Registra el nombre comercial y su tarifa base por hora.</p>
      <div className="rejilla-dos">
        <label>Nombre<input name="nombre" required maxLength={120} /></label>
        <label>Tarifa base (soles/hora)<input name="tarifa" inputMode="decimal" required /></label>
      </div>
      <div className="acciones-panel">
        <button type="submit" className="boton boton-primario" disabled={creando}>
          {creando ? 'Creando...' : 'Crear cancha'}
        </button>
      </div>
    </form>
  );
}
