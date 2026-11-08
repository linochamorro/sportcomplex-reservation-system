import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { leerSesionServidor } from '@/lib/ui/sesion';
import { mesEnLima } from '@/lib/ui/reloj-lima';

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const porcentaje = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 1 });

const TIPOS = [
  { id: 'ingresos', etiqueta: 'Ingresos' },
  { id: 'ocupacion', etiqueta: 'Ocupación' },
  { id: 'estados', etiqueta: 'Estados' },
  { id: 'clientes', etiqueta: 'Clientes' },
] as const;

type Datos =
  | Array<{ sede: string; cancha: string; fecha: string; diaSemana: number; horaInicio: string; reservas: number; ingresosCentavos: number }>
  | { porSede: Array<{ sede: string; confirmadas: number; ingresosCentavos: number; ticketPromedioCentavos: number }>; porCancha: Array<{ sede: string; cancha: string; confirmadas: number; ingresosCentavos: number }> }
  | { filas: Array<{ sede: string; estado: string; total: number; tasa: number }>; total: number }
  | { top: Array<{ usuarioNombre: string; usuarioEmail: string; reservas: number; confirmadas: number; ingresosCentavos: number }>; horasPico: Array<{ horaInicio: string; reservas: number }> };

export default async function PaginaReportes({
  searchParams,
}: {
  searchParams: Promise<{ tipo?: string; mes?: string; sedeId?: string }>;
}) {
  const sesion = await leerSesionServidor();
  if (!sesion || (sesion.rol !== 'ADMIN' && sesion.rol !== 'SUPERADMIN')) redirect('/login');
  const params = await searchParams;
  const tipo = TIPOS.some((t) => t.id === params.tipo) ? (params.tipo as string) : 'ingresos';
  const mes = /^\d{4}-(0[1-9]|1[0-2])$/.test(params.mes ?? '') ? (params.mes as string) : mesEnLima();
  const sedeId = sesion.rol === 'ADMIN' ? String(sesion.sedeId ?? '') : (params.sedeId ?? '');
  const base = await baseUrlLocal();
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  const query = new URLSearchParams({ tipo, mes, ...(sedeId ? { sedeId } : {}) }).toString();
  const respuesta = await jsonSeguro<{ datos: Datos }>(
    await fetch(`${base}/api/reportes?${query}`, { headers: { cookie: `access_token=${galleta}` }, cache: 'no-store' }).catch(() => null),
    { datos: [] as unknown as Datos },
  );
  const datos = respuesta.datos;
  const sedes =
    sesion.rol === 'SUPERADMIN'
      ? await jsonSeguro<{ sedes: Array<{ id: number; nombre: string }> }>(
          await fetch(`${base}/api/sedes?incluirPruebas=1`, { headers: { cookie: `access_token=${galleta}` }, cache: 'no-store' }).catch(() => null),
          { sedes: [] },
        ).then((j) => j.sedes)
      : [];
  const exportar = (formato: 'csv' | 'pdf') => `/api/reportes?${query}&formato=${formato}`;
  const etiquetaTipo = TIPOS.find((t) => t.id === tipo)?.etiqueta ?? 'Reporte';

  return (
    <DisposicionRol actual="/reportes" roles={['ADMIN', 'SUPERADMIN']}>
      <h1>Reportes</h1>
      <p className="app-subtitulo">Cuadros de uso del mes {mes} · mes completo, sin tope de filas.</p>
      <form className="selector-sede" method="get" action="/reportes" aria-label="Filtrar reportes">
        <label htmlFor="rep-tipo">Cuadro</label>
        <select id="rep-tipo" name="tipo" defaultValue={tipo}>
          {TIPOS.map((t) => (
            <option key={t.id} value={t.id}>
              {t.etiqueta}
            </option>
          ))}
        </select>
        <label htmlFor="rep-mes">Mes</label>
        <input id="rep-mes" name="mes" type="month" defaultValue={mes} required />
        {sesion.rol === 'SUPERADMIN' ? (
          <>
            <label htmlFor="rep-sede">Sede</label>
            <select id="rep-sede" name="sedeId" defaultValue={sedeId}>
              <option value="">Todas</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <button type="submit" className="boton boton-secundario">
          Ver cuadro
        </button>
      </form>
      <div className="acciones-panel" role="group" aria-label="Descargar este cuadro">
        <p className="app-subtitulo">
          Descargar el cuadro «{etiquetaTipo}» de {mes}: elige el formato.
        </p>
        <div className="botones-fila">
          <Link className="boton boton-primario" href={exportar('pdf')} prefetch={false}>
            Descargar PDF
          </Link>
          <Link className="boton boton-secundario" href={exportar('csv')} prefetch={false}>
            Descargar CSV
          </Link>
        </div>
      </div>

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
    </DisposicionRol>
  );
}
