import type { Datos } from './reporte-types';

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const porcentaje = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 1 });

type Props = { tipo: string; datos: Datos };

export function ReporteDatos({ tipo, datos }: Props) {
  return (
    <>
      {tipo === 'ingresos' && 'porSede' in (datos as object) ? (
        <>
          <section className="panel" aria-label="Ingresos por sede">
            <div className="encabezado-panel">
              <h2>Ingresos por sede</h2>
            </div>
            {(datos as Extract<Datos, { porSede: unknown[] }>).porSede.length === 0 ? (
              <p role="status">Sin ingresos en el mes seleccionado.</p>
            ) : (
              <ul className="lista-gestion">
                {(datos as Extract<Datos, { porSede: unknown[] }>).porSede.map((s) => (
                  <li key={s.sede} className="fila-gestion">
                    <div>
                      <strong>{s.sede}</strong>
                      <span>
                        {s.confirmadas} confirmadas · {soles.format(s.ingresosCentavos / 100)} · ticket{' '}
                        {soles.format(s.ticketPromedioCentavos / 100)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="panel" aria-label="Ingresos por cancha">
            <div className="encabezado-panel">
              <h2>Ingresos por cancha</h2>
            </div>
            <ul className="lista-gestion">
              {(datos as Extract<Datos, { porCancha: unknown[] }>).porCancha.map((c) => (
                <li key={`${c.sede}-${c.cancha}`} className="fila-gestion">
                  <div>
                    <strong>
                      {c.cancha} · {c.sede}
                    </strong>
                    <span>
                      {c.confirmadas} confirmadas · {soles.format(c.ingresosCentavos / 100)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}

      {tipo === 'ocupacion' && Array.isArray(datos) ? (
        <section className="panel" aria-label="Ocupación por turno">
          <div className="encabezado-panel">
            <h2>Ocupación por turno</h2>
            <p>Turnos con al menos una reserva de uso (pendiente, confirmada o no-show).</p>
          </div>
          {datos.length === 0 ? (
            <p role="status">Sin ocupación en el mes seleccionado.</p>
          ) : (
            <ul className="lista-gestion">
              {datos.map((f) => (
                <li key={`${f.cancha}-${f.fecha}-${f.horaInicio}`} className="fila-gestion">
                  <div>
                    <strong>
                      {f.fecha} · {f.horaInicio} · {f.cancha}
                    </strong>
                    <span>
                      {f.sede} · {f.reservas} reserva(s) · {soles.format(f.ingresosCentavos / 100)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {tipo === 'estados' && 'filas' in (datos as object) ? (
        <section className="panel" aria-label="Reservas por estado">
          <div className="encabezado-panel">
            <h2>Reservas por estado</h2>
            <p>Total del mes: {(datos as Extract<Datos, { total: number }>).total} reservas.</p>
          </div>
          <ul className="lista-gestion">
            {(datos as Extract<Datos, { filas: unknown[] }>).filas.map((f) => (
              <li key={`${f.sede}-${f.estado}`} className="fila-gestion">
                <div>
                  <strong>
                    {f.sede} · {f.estado}
                  </strong>
                  <span>
                    {f.total} reservas · {porcentaje.format(f.tasa)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {tipo === 'clientes' && 'top' in (datos as object) ? (
        <>
          <section className="panel" aria-label="Mejores clientes">
            <div className="encabezado-panel">
              <h2>Mejores clientes</h2>
            </div>
            <ul className="lista-gestion">
              {(datos as Extract<Datos, { top: unknown[] }>).top.map((c) => (
                <li key={c.usuarioEmail} className="fila-gestion">
                  <div>
                    <strong>
                      {c.usuarioNombre} · {c.usuarioEmail}
                    </strong>
                    <span>
                      {c.reservas} reservas · {c.confirmadas} confirmadas · {soles.format(c.ingresosCentavos / 100)}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          <section className="panel" aria-label="Horarios pico">
            <div className="encabezado-panel">
              <h2>Horarios pico</h2>
            </div>
            <ul className="lista-gestion">
              {(datos as Extract<Datos, { horasPico: unknown[] }>).horasPico.map((h) => (
                <li key={h.horaInicio} className="fila-gestion">
                  <div>
                    <strong>{h.horaInicio}</strong>
                    <span>{h.reservas} reserva(s) de uso</span>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </>
  );
}
