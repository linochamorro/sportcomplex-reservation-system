import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { GrillaDiaria } from '@/components/grilla/GrillaDiaria';
import { TiraKpis } from '@/components/kpis/TiraKpis';
import { InsigniaEstado } from '@/components/estado/InsigniaEstado';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { leerSesionServidor } from '@/lib/ui/sesion';
import { fechaEnLima } from '@/lib/ui/reloj-lima';
import { calcularMetricas } from '@/lib/panel/metricas';

type SedeApi = { id: number; nombre: string; apertura: string; cierre: string };
type CanchaApi = { id: number; nombre: string; tarifaBaseCentavos: number; estado: string; motivoNoDisponible: string | null };
type SolicitudApi = {
  id: number;
  canchaId: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  estado: string;
  montoTotalCentavos: number;
  usuarioId: number;
  motivo: string | null;
  limiteHold: string | null;
};
type NotificacionApi = { id: number; titulo: string; cuerpo: string; leida: boolean };

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
const porcentaje = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 1 });

export default async function PaginaConfiguracion({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; sede?: string }>;
}) {
  const sesion = await leerSesionServidor();
  if (!sesion) redirect('/login');
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  const base = await baseUrlLocal();
  const cabeceras = { cookie: `access_token=${galleta}` };

  if (sesion.rol === 'USUARIO') {
    const [solR, notR, sedesR] = await Promise.all([
      fetch(`${base}/api/solicitudes`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      fetch(`${base}/api/notificaciones`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      fetch(`${base}/api/sedes?incluirPruebas=1`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
    ]);
    const solicitudes = (
      await jsonSeguro<{ solicitudes: SolicitudApi[] }>(solR, { solicitudes: [] })
    ).solicitudes;
    const notificaciones = (
      await jsonSeguro<{ notificaciones: NotificacionApi[] }>(notR, { notificaciones: [] })
    ).notificaciones;
    const sedes = (await jsonSeguro<{ sedes: SedeApi[] }>(sedesR, { sedes: [] })).sedes;
    const canchasPorSede = await Promise.all(
      sedes.map(async (s) => {
        const j = await jsonSeguro<{ canchas: Array<{ id: number; nombre: string }> }>(
          await fetch(`${base}/api/canchas?sedeId=${s.id}`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
          { canchas: [] },
        );
        return j.canchas.map((c) => ({ ...c, sedeNombre: s.nombre }));
      }),
    );
    const porCancha = new Map(canchasPorSede.flat().map((c) => [c.id, c]));
    const confirmadas = solicitudes.filter((s) => s.estado === 'CONFIRMADA').length;
    const noLeidas = notificaciones.filter((n) => !n.leida);
    const ultimas = [...solicitudes]
      .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.horaInicio < b.horaInicio ? 1 : -1))
      .slice(0, 12);
    const porFecha = new Map<string, typeof ultimas>();
    for (const s of ultimas) {
      porFecha.set(s.fecha, [...(porFecha.get(s.fecha) ?? []), s]);
    }
    return (
      <DisposicionRol actual="/configuracion" roles={['USUARIO']}>
        <h1>Dashboard</h1>
        <p className="app-subtitulo">Tu actividad reciente y tus próximas reservas.</p>
        <TiraKpis
          kpis={[
            { etiqueta: 'Mis reservas', valor: String(solicitudes.length) },
            { etiqueta: 'Confirmadas', valor: String(confirmadas) },
            { etiqueta: 'Pendientes', valor: String(solicitudes.filter((s) => s.estado === 'PENDIENTE').length) },
            { etiqueta: 'Notificaciones sin leer', valor: String(noLeidas.length) },
          ]}
        />
        <section className="panel" aria-label="Últimas reservas por fecha">
          <div className="encabezado-panel">
            <h2>Últimas reservas</h2>
            <p>Clasificadas por fecha, con sede y estado.</p>
          </div>
          {ultimas.length === 0 ? (
            <p role="status">Todavía no tienes reservas.</p>
          ) : (
            [...porFecha.entries()].map(([fecha, reservas]) => (
              <div key={fecha}>
                <h3>{fecha}</h3>
                <ul className="lista-gestion">
                  {reservas.map((r) => (
                    <li key={r.id} className="fila-gestion">
                      <div>
                        <strong>
                          {porCancha.get(r.canchaId)?.nombre ?? `Cancha ${r.canchaId}`} · {r.horaInicio}–{r.horaFin}
                        </strong>
                        <span>
                          {porCancha.get(r.canchaId)?.sedeNombre ?? 'Sede no disponible'} ·{' '}
                          {soles.format(r.montoTotalCentavos / 100)}
                        </span>
                      </div>
                      <InsigniaEstado estado={r.estado} />
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </section>
        <section className="panel" aria-label="Notificaciones recientes">
          <div className="encabezado-panel">
            <h2>Notificaciones</h2>
            <p>{noLeidas.length === 0 ? 'Estás al día.' : `Tienes ${noLeidas.length} sin leer.`}</p>
          </div>
          {notificaciones.length === 0 ? (
            <p role="status">Sin notificaciones.</p>
          ) : (
            <ul className="lista-gestion">
              {notificaciones.slice(0, 5).map((n) => (
                <li key={n.id} className="fila-gestion">
                  <div>
                    <strong>
                      {n.titulo} {n.leida ? '' : '(nueva)'}
                    </strong>
                    <span>{n.cuerpo}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href="/notificaciones">Ver notificaciones</Link> · <Link href="/reservar">Reservar cancha</Link>
          </p>
        </section>
      </DisposicionRol>
    );
  }

  const params = await searchParams;
  const fecha = params.fecha ?? fechaEnLima();
  const mes = fecha.slice(0, 7);
  const sedes = (
    await jsonSeguro<{ sedes: SedeApi[] }>(
      await fetch(`${base}/api/sedes?incluirPruebas=1`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      { sedes: [] },
    )
  ).sedes;
  const sedeOperativa = sesion.rol === 'ADMIN' ? sedes.find((s) => s.id === sesion.sedeId) ?? null : null;
  if (sesion.rol === 'ADMIN' && !sedeOperativa) {
    return (
      <DisposicionRol actual="/configuracion" roles={['ADMIN']}>
        <h1>Dashboard</h1>
        <p role="alert">Tu cuenta administradora no tiene una sede asignada.</p>
      </DisposicionRol>
    );
  }
  const filtroSede = sesion.rol === 'SUPERADMIN' ? (params.sede ?? 'todas') : String(sesion.sedeId);
  const sedesAlcance =
    sesion.rol === 'SUPERADMIN' && filtroSede !== 'todas'
      ? sedes.filter((s) => String(s.id) === filtroSede)
      : sesion.rol === 'ADMIN' && sedeOperativa
        ? [sedeOperativa]
        : sedes;
  const [solicitudes, canchas] = await Promise.all([
    jsonSeguro<{ solicitudes: SolicitudApi[] }>(
      // QA-03: el panel agrega el mes completo, sin el tope de 100 filas.
      await fetch(`${base}/api/solicitudes?mes=${mes}&limite=5000`, { headers: cabeceras, cache: 'no-store' }).catch(
        () => null,
      ),
      { solicitudes: [] },
    ).then((j) => j.solicitudes),
    Promise.all(
      sedesAlcance.map(async (s) => {
        const j = await jsonSeguro<{ canchas: CanchaApi[] }>(
          await fetch(`${base}/api/canchas?sedeId=${s.id}`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
          { canchas: [] },
        );
        return j.canchas.map((c) => ({ ...c, sedeId: s.id, sedeNombre: s.nombre }));
      }),
    ).then((listas) => listas.flat()),
  ]);
  const porCancha = new Map(canchas.map((c) => [c.id, c]));
  const enAlcance = (sedeId: number | null) =>
    sesion.rol === 'SUPERADMIN'
      ? filtroSede === 'todas' || String(sedeId) === filtroSede
      : sedeId === sesion.sedeId;
  const enriquecidas = solicitudes
    .map((s) => {
      const cancha = porCancha.get(s.canchaId);
      return {
        id: s.id,
        estado: s.estado,
        fecha: s.fecha,
        horaInicio: s.horaInicio,
        horaFin: s.horaFin,
        montoTotalCentavos: s.montoTotalCentavos,
        usuarioId: s.usuarioId,
        motivo: s.motivo,
        limiteHold: s.limiteHold,
        sedeId: cancha?.sedeId ?? null,
        sedeNombre: cancha?.sedeNombre ?? 'Sede no disponible',
        canchaId: s.canchaId,
        canchaNombre: cancha?.nombre ?? `Cancha ${s.canchaId}`,
      };
    })
    .filter((s) => enAlcance(s.sedeId));
  const delDia = enriquecidas.filter((s) => s.fecha === fecha);
  const delMes = enriquecidas.filter((s) => s.fecha.startsWith(mes));
  const metricas = calcularMetricas(delDia, { sedes: sedesAlcance.length, canchas: canchas.length });
  const ingresoMensual = delMes.filter((s) => s.estado === 'CONFIRMADA').reduce((a, s) => a + s.montoTotalCentavos, 0);
  const clientesActivos = new Set(
    delMes.filter((s) => s.estado === 'PENDIENTE' || s.estado === 'CONFIRMADA').map((s) => s.usuarioId),
  ).size;
  const resumen = sedesAlcance.map((sede) => {
    const canchasSede = canchas.filter((c) => c.sedeId === sede.id);
    const noDisponibles = canchasSede.filter((c) => c.estado !== 'DISPONIBLE');
    const confirmadas = delDia.filter((s) => s.sedeId === sede.id && s.estado === 'CONFIRMADA');
    return {
      sede,
      activas: canchasSede.length,
      noDisponibles,
      confirmadas: confirmadas.length,
      ingreso: confirmadas.reduce((a, s) => a + s.montoTotalCentavos, 0),
    };
  });

  return (
    <DisposicionRol actual="/configuracion" roles={[sesion.rol]}>
      <h1>Dashboard</h1>
      <p className="app-subtitulo">
        {sesion.rol === 'ADMIN' && sedeOperativa ? `Operación de ${sedeOperativa.nombre} · ` : 'Operación global · '}
        resultados del {fecha}.
      </p>
      <form className="selector-sede" method="get" action="/configuracion" aria-label="Filtrar el panel">
        <label htmlFor="panel-fecha">Fecha</label>
        <input id="panel-fecha" name="fecha" type="date" defaultValue={fecha} required />
        {sesion.rol === 'SUPERADMIN' ? (
          <>
            <label htmlFor="panel-sede">Sede</label>
            <select id="panel-sede" name="sede" defaultValue={filtroSede}>
              <option value="todas">Todas las sedes</option>
              {sedes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.nombre}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <button type="submit" className="boton boton-secundario">
          Ver día
        </button>
      </form>
      <div className="kpi-dashboard">
        <TiraKpis
          kpis={[
            { etiqueta: 'Confirmadas', valor: String(metricas.confirmadas) },
            { etiqueta: 'Pendientes', valor: String(metricas.pendientes) },
            { etiqueta: 'Tasa de confirmación', valor: porcentaje.format(metricas.tasaConfirmacion) },
            { etiqueta: 'Ingresos del día', valor: soles.format(metricas.ingresosCentavos / 100) },
            { etiqueta: 'Ingresos del mes', valor: soles.format(ingresoMensual / 100) },
            { etiqueta: 'No-show', valor: String(metricas.noShow) },
            ...(sesion.rol === 'SUPERADMIN'
              ? [{ etiqueta: 'Usuarios activos', valor: String(clientesActivos) }]
              : []),
          ]}
        />
      </div>
      <section className="panel" aria-label="Resumen del día por sede">
        <div className="encabezado-panel">
          <h2>Resumen del día</h2>
          <p>Sede, canchas activas, disponibilidad, confirmadas e ingreso del {fecha}.</p>
        </div>
        {resumen.length === 0 ? (
          <p role="status">Sin sedes en el alcance seleccionado.</p>
        ) : (
          <ul className="lista-gestion">
            {resumen.map((r) => (
              <li key={r.sede.id} className="fila-gestion">
                <div>
                  <strong>{r.sede.nombre}</strong>
                  <span>
                    {r.activas} canchas activas · {r.confirmadas} confirmadas · {soles.format(r.ingreso / 100)}
                  </span>
                  <span>
                    {r.noDisponibles.length === 0
                      ? 'Todas las canchas están disponibles.'
                      : `No disponibles: ${r.noDisponibles
                          .map((c) => `${c.nombre} (${c.motivoNoDisponible ?? 'sin motivo'})`)
                          .join('; ')}`}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section className="panel" aria-label="Negocio por sede">
        <div className="encabezado-panel">
          <h2>Negocio por sede</h2>
          <p>Reservas confirmadas, ingresos y canchas destacadas del día seleccionado.</p>
        </div>
        <div className="rejilla-dos">
          <div>
            <h3>Sedes destacadas</h3>
            {metricas.topSedes.length === 0 ? (
              <p role="status">Sin reservas confirmadas.</p>
            ) : (
              <ul className="lista-gestion">
                {metricas.topSedes.map((s) => (
                  <li key={s.sedeId ?? s.sede} className="fila-gestion">
                    <div>
                      <strong>{s.sede}</strong>
                      <span>
                        {s.confirmadas} confirmadas · {soles.format(s.ingresosCentavos / 100)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div>
            <h3>Canchas destacadas</h3>
            {metricas.topCanchas.length === 0 ? (
              <p role="status">Sin reservas confirmadas.</p>
            ) : (
              <ul className="lista-gestion">
                {metricas.topCanchas.map((c) => (
                  <li key={c.canchaId} className="fila-gestion">
                    <div>
                      <strong>{c.cancha}</strong>
                      <span>
                        {c.confirmadas} confirmadas · {soles.format(c.ingresosCentavos / 100)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
      <GrillaDiaria
        celdas={delDia.map((s) => ({
          solicitudId: s.id,
          canchaId: s.canchaId,
          cancha: s.canchaNombre,
          horaInicio: s.horaInicio,
          horaFin: s.horaFin,
          estado: s.estado,
          motivo: s.motivo,
          limiteHold: s.limiteHold,
        }))}
        puedeConfirmar={sesion.rol === 'ADMIN' || sesion.rol === 'SUPERADMIN'}
        key={`${fecha}-${filtroSede}`}
      />
    </DisposicionRol>
  );
}
