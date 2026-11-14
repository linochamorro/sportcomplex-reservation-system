import type { CanchaAdmin } from './panel-canchas-types';

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

export function PanelCanchasLista({
  lista,
  soloLectura,
  sinEliminar,
  abrirEdicion,
  abrirEliminacion,
}: {
  lista: CanchaAdmin[];
  soloLectura: boolean;
  sinEliminar: boolean;
  abrirEdicion: (cancha: CanchaAdmin) => void;
  abrirEliminacion: (cancha: CanchaAdmin) => void;
}) {
  return (
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
  );
}
