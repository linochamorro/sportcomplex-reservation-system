import Link from 'next/link';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { TiraKpis } from '@/components/kpis/TiraKpis';
import { InsigniaEstado } from '@/components/estado/InsigniaEstado';

type Reserva = { id: number; canchaId: number; fecha: string; horaInicio: string; horaFin: string; estado: string; montoTotalCentavos: number };
type Notificacion = { id: number; titulo: string; cuerpo: string; leida: boolean };
type Cancha = { id: number; nombre: string; sedeNombre: string };

export function PanelUsuario({ solicitudes, notificaciones, canchas }: { solicitudes: Reserva[]; notificaciones: Notificacion[]; canchas: Cancha[] }) {
  const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
  const porCancha = new Map(canchas.map((c) => [c.id, c]));
  const confirmadas = solicitudes.filter((s) => s.estado === 'CONFIRMADA').length;
  const noLeidas = notificaciones.filter((n) => !n.leida);
  const ultimas = [...solicitudes]
    .sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : a.horaInicio < b.horaInicio ? 1 : -1))
    .slice(0, 12);
  const porFecha = new Map<string, typeof ultimas>();
  for (const s of ultimas) porFecha.set(s.fecha, [...(porFecha.get(s.fecha) ?? []), s]);
  return (
    <DisposicionRol actual="/configuracion" roles={['USUARIO']}>
      <h1>Dashboard</h1>
      <p className="app-subtitulo">Tu actividad reciente y tus próximas reservas.</p>
      <TiraKpis kpis={[
        { etiqueta: 'Mis reservas', valor: String(solicitudes.length) },
        { etiqueta: 'Confirmadas', valor: String(confirmadas) },
        { etiqueta: 'Pendientes', valor: String(solicitudes.filter((s) => s.estado === 'PENDIENTE').length) },
        { etiqueta: 'Notificaciones sin leer', valor: String(noLeidas.length) },
      ]} />
      <section className="panel" aria-label="Últimas reservas por fecha">
        <div className="encabezado-panel"><h2>Últimas reservas</h2><p>Clasificadas por fecha, con sede y estado.</p></div>
        {ultimas.length === 0 ? <p role="status">Todavía no tienes reservas.</p> : [...porFecha.entries()].map(([fecha, reservas]) => (
          <div key={fecha}><h3>{fecha}</h3><ul className="lista-gestion">{reservas.map((r) => (
            <li key={r.id} className="fila-gestion"><div><strong>{porCancha.get(r.canchaId)?.nombre ?? `Cancha ${r.canchaId}`} · {r.horaInicio}–{r.horaFin}</strong>
              <span>{porCancha.get(r.canchaId)?.sedeNombre ?? 'Sede no disponible'} · {soles.format(r.montoTotalCentavos / 100)}</span></div><InsigniaEstado estado={r.estado} /></li>
          ))}</ul></div>
        ))}
      </section>
      <section className="panel" aria-label="Notificaciones recientes">
        <div className="encabezado-panel"><h2>Notificaciones</h2><p>{noLeidas.length === 0 ? 'Estás al día.' : `Tienes ${noLeidas.length} sin leer.`}</p></div>
        {notificaciones.length === 0 ? <p role="status">Sin notificaciones.</p> : <ul className="lista-gestion">{notificaciones.slice(0, 5).map((n) => (
          <li key={n.id} className="fila-gestion"><div><strong>{n.titulo} {n.leida ? '' : '(nueva)'}</strong><span>{n.cuerpo}</span></div></li>
        ))}</ul>}
        <p><Link href="/notificaciones">Ver notificaciones</Link> · <Link href="/reservar">Reservar cancha</Link></p>
      </section>
    </DisposicionRol>
  );
}
