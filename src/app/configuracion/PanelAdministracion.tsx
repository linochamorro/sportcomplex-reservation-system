import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { GrillaDiaria } from '@/components/grilla/GrillaDiaria';
import { TiraKpis } from '@/components/kpis/TiraKpis';
import { calcularMetricas } from '@/lib/panel/metricas';

type Sede = { id: number; nombre: string; apertura: string; cierre: string };
type CanchaResumen = { nombre: string; motivoNoDisponible: string | null };
type SolicitudDia = { id: number; canchaId: number; canchaNombre: string; horaInicio: string; horaFin: string; estado: string; motivo: string | null; limiteHold: string | null };
type Resumen = { sede: Sede; activas: number; noDisponibles: CanchaResumen[]; confirmadas: number; ingreso: number };
type Rol = 'ADMIN' | 'SUPERADMIN';

export function PanelAdministracion({ rol, fecha, filtroSede, sedeOperativa, sedes, metricas, ingresoMensual, clientesActivos, resumen, delDia }: {
  rol: Rol; fecha: string; filtroSede: string; sedeOperativa: Sede | null; sedes: Sede[];
  metricas: ReturnType<typeof calcularMetricas>; ingresoMensual: number; clientesActivos: number;
  resumen: Resumen[]; delDia: SolicitudDia[];
}) {
  const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });
  const porcentaje = new Intl.NumberFormat('es-PE', { style: 'percent', maximumFractionDigits: 1 });
  return (
    <DisposicionRol actual="/configuracion" roles={[rol]}>
      <h1>Dashboard</h1>
      <p className="app-subtitulo">{rol === 'ADMIN' && sedeOperativa ? `Operación de ${sedeOperativa.nombre} · ` : 'Operación global · '}resultados del {fecha}.</p>
      <form className="selector-sede" method="get" action="/configuracion" aria-label="Filtrar el panel">
        <label htmlFor="panel-fecha">Fecha</label><input id="panel-fecha" name="fecha" type="date" defaultValue={fecha} required />
        {rol === 'SUPERADMIN' ? <><label htmlFor="panel-sede">Sede</label><select id="panel-sede" name="sede" defaultValue={filtroSede}>
          <option value="todas">Todas las sedes</option>{sedes.map((s) => <option key={s.id} value={s.id}>{s.nombre}</option>)}
        </select></> : null}
        <button type="submit" className="boton boton-secundario">Ver día</button>
      </form>
      <div className="kpi-dashboard"><TiraKpis kpis={[
        { etiqueta: 'Confirmadas', valor: String(metricas.confirmadas) }, { etiqueta: 'Pendientes', valor: String(metricas.pendientes) },
        { etiqueta: 'Tasa de confirmación', valor: porcentaje.format(metricas.tasaConfirmacion) }, { etiqueta: 'Ingresos del día', valor: soles.format(metricas.ingresosCentavos / 100) },
        { etiqueta: 'Ingresos del mes', valor: soles.format(ingresoMensual / 100) }, { etiqueta: 'No-show', valor: String(metricas.noShow) },
        ...(rol === 'SUPERADMIN' ? [{ etiqueta: 'Usuarios activos', valor: String(clientesActivos) }] : []),
      ]} /></div>
      <section className="panel" aria-label="Resumen del día por sede"><div className="encabezado-panel"><h2>Resumen del día</h2><p>Sede, canchas activas, disponibilidad, confirmadas e ingreso del {fecha}.</p></div>
        {resumen.length === 0 ? <p role="status">Sin sedes en el alcance seleccionado.</p> : <ul className="lista-gestion">{resumen.map((r) => <li key={r.sede.id} className="fila-gestion"><div>
          <strong>{r.sede.nombre}</strong><span>{r.activas} canchas activas · {r.confirmadas} confirmadas · {soles.format(r.ingreso / 100)}</span>
          <span>{r.noDisponibles.length === 0 ? 'Todas las canchas están disponibles.' : `No disponibles: ${r.noDisponibles.map((c) => `${c.nombre} (${c.motivoNoDisponible ?? 'sin motivo'})`).join('; ')}`}</span>
        </div></li>)}</ul>}
      </section>
      <section className="panel" aria-label="Negocio por sede"><div className="encabezado-panel"><h2>Negocio por sede</h2><p>Reservas confirmadas, ingresos y canchas destacadas del día seleccionado.</p></div>
        <div className="rejilla-dos"><div><h3>Sedes destacadas</h3>{metricas.topSedes.length === 0 ? <p role="status">Sin reservas confirmadas.</p> : <ul className="lista-gestion">{metricas.topSedes.map((s) => <li key={s.sedeId ?? s.sede} className="fila-gestion"><div><strong>{s.sede}</strong><span>{s.confirmadas} confirmadas · {soles.format(s.ingresosCentavos / 100)}</span></div></li>)}</ul>}</div>
          <div><h3>Canchas destacadas</h3>{metricas.topCanchas.length === 0 ? <p role="status">Sin reservas confirmadas.</p> : <ul className="lista-gestion">{metricas.topCanchas.map((c) => <li key={c.canchaId} className="fila-gestion"><div><strong>{c.cancha}</strong><span>{c.confirmadas} confirmadas · {soles.format(c.ingresosCentavos / 100)}</span></div></li>)}</ul>}</div>
        </div>
      </section>
      <GrillaDiaria celdas={delDia.map((s) => ({ solicitudId: s.id, canchaId: s.canchaId, cancha: s.canchaNombre, horaInicio: s.horaInicio, horaFin: s.horaFin, estado: s.estado, motivo: s.motivo, limiteHold: s.limiteHold }))}
        puedeConfirmar={rol === 'ADMIN' || rol === 'SUPERADMIN'} key={`${fecha}-${filtroSede}`} />
    </DisposicionRol>
  );
}
