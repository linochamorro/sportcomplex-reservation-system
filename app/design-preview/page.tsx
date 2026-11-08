import { ESTADOS, IDS_ESTADO, PRIMITIVOS, SEMANTICOS } from '@/lib/design-tokens';
import { IconoEstado } from '@/components/estado/IconoEstado';
import './preview.css';

function Muestra({ nombre, valor }: { nombre: string; valor: string }) {
  return (
    <div className="pv-muestra">
      <span className="pv-pastilla" style={{ background: valor }} aria-hidden="true" />
      <code>{nombre}</code>
      <code>{valor}</code>
    </div>
  );
}

export default function VistaPreviaDiseno() {
  return (
    <main aria-labelledby="pv-titulo" className="pv-raiz">
      <h1 id="pv-titulo">Vista previa de diseño — DESIGN.md v1.0</h1>
      <p role="status">Ruta temporal de previsualización; no es una página del producto.</p>

      <section aria-labelledby="pv-colores">
        <h2 id="pv-colores">Colores primitivos</h2>
        {Object.entries(PRIMITIVOS).map(([nombre, valor]) => (
          <Muestra key={nombre} nombre={nombre} valor={valor} />
        ))}
      </section>

      <section aria-labelledby="pv-semanticos">
        <h2 id="pv-semanticos">Semánticos</h2>
        {Object.entries(SEMANTICOS).map(([nombre, valor]) => (
          <Muestra key={nombre} nombre={nombre} valor={valor} />
        ))}
      </section>

      <section aria-labelledby="pv-estados">
        <h2 id="pv-estados">Gramática de estados 6+4 (color + icono + patrón + etiqueta)</h2>
        {IDS_ESTADO.map((id) => {
          const ficha = ESTADOS[id];
          return (
            <article key={id} className="pv-estado">
              <h3>{id}</h3>
              <span
                role="img"
                aria-label={ficha.etiqueta}
                className={`pv-insignia pv-patron-${ficha.patron}`}
                style={{
                  background: ficha.relleno,
                  color: ficha.texto,
                  border: ficha.borde,
                  ['--estado-icono-contraste' as string]: ficha.texto === '#FFFFFF' ? '#FFFFFF' : ficha.relleno,
                }}
              >
                <IconoEstado id={id} className="pv-insignia-icono" />
                <span className="pv-insignia-texto">{ficha.etiqueta}</span>
              </span>
              <dl>
                <dt>Patrón</dt>
                <dd>{ficha.patron}</dd>
                <dt>Cuenta atrás</dt>
                <dd>{ficha.exigeCuentaAtras ? 'sí' : 'no'}</dd>
                <dt>Motivo</dt>
                <dd>{ficha.exigeMotivo ? 'sí' : 'no'}</dd>
              </dl>
            </article>
          );
        })}
      </section>

      <section aria-labelledby="pv-tipo">
        <h2 id="pv-tipo">Tipografía y foco</h2>
        <p className="pv-display">Barlow Condensed — Display 39/31/25</p>
        <p>Barlow — texto 16/14/12 con tabular-nums: 08:00 12:30 23:59</p>
        <p>
          <a href="#pv-tipo">Enlace de ejemplo</a> · <button type="button">Botón primario</button>{' '}
          <button type="button" disabled>
            Deshabilitado
          </button>
        </p>
      </section>

      <section aria-labelledby="pv-sesion">
        <h2 id="pv-sesion">Banner de sesión + esqueleto + cuenta atrás</h2>
        <div role="status" className="pv-banner">
          Tu sesión vence en <span role="timer">04:32</span> — tu borrador se conserva
        </div>
        <div aria-label="Cargando contenido" role="status" className="pv-esqueleto">
          <span className="pv-linea" />
          <span className="pv-linea" />
        </div>
      </section>

      <section aria-labelledby="pv-flujos">
        <h2 id="pv-flujos">Flujos planificados (rutas futuras)</h2>
        <ul>
          <li>USUARIO: /reservar, /mis-reservas, /notificaciones, /ayuda</li>
          <li>ADMIN: /grilla, /pendientes, /bloqueos, /kpis, /notificaciones</li>
          <li>SUPERADMIN: /consolidado, /sedes, /canchas, /tarifas, /usuarios</li>
        </ul>
      </section>
    </main>
  );
}
