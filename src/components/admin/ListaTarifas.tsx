'use client';

import type { TarifaAdmin } from './PanelTarifas';

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

export function ListaTarifas({
  lista,
  soloLectura,
  onEditar,
}: {
  lista: TarifaAdmin[];
  soloLectura: boolean;
  onEditar: (tarifa: TarifaAdmin) => void;
}) {
  return (
    <section className="panel" aria-label="Tarifas de la sede">
      <div className="encabezado-panel">
        <h2>Tarifas</h2>
        <p>{lista.length === 0 ? 'Esta sede todavía no tiene tarifas.' : `${lista.length} tarifa${lista.length === 1 ? '' : 's'} registradas.`}</p>
      </div>
      {lista.length === 0 ? (
        <p role="status">Sin tarifas en esta sede.</p>
      ) : (
        <ul className="lista-gestion">
          {lista.map((t) => (
            <li key={t.id} className="fila-gestion">
              <div>
                <strong>{t.nombre}</strong>
                <span>
                  {t.diasSemana.map((d) => DIAS[d]).join(', ')} · {t.horaInicio}–{t.horaFin} ·{' '}
                  {soles.format(t.montoCentavos / 100)}
                </span>
              </div>
              {!soloLectura ? (
                <div className="botones-fila">
                  <button type="button" className="boton boton-secundario" onClick={() => onEditar(t)}>
                    Editar
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
