import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { baseUrlLocal } from '@/lib/ui/base-url';
import { jsonSeguro } from '@/lib/ui/fetch-seguro';
import { leerSesionServidor } from '@/lib/ui/sesion';
import { fechaEnLima } from '@/lib/ui/reloj-lima';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { TiraKpis } from '@/components/kpis/TiraKpis';
import { calcularKpis } from '@/lib/panel/kpis';

const soles = new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' });

export default async function PaginaKpis({
  searchParams,
}: {
  searchParams: Promise<{ fecha?: string; mes?: string; cancha?: string }>;
}) {
  const sesion = await leerSesionServidor();
  if (!sesion || sesion.rol !== 'ADMIN') redirect('/login');
  if (!sesion.sedeId) {
    return (
      <DisposicionRol actual="/kpis" roles={['ADMIN']}>
        <h1>Indicadores</h1>
        <p role="alert">Tu cuenta administradora no tiene una sede asignada.</p>
      </DisposicionRol>
    );
  }
  const base = await baseUrlLocal();
  const galleta = (await cookies()).get('access_token')?.value ?? '';
  const cabeceras = { cookie: `access_token=${galleta}` };
  const params = await searchParams;
  const hoy = fechaEnLima();
  const fecha = params.fecha ?? hoy;
  const mes = /^\d{4}-\d{2}$/.test(params.mes ?? '') ? (params.mes as string) : fecha.slice(0, 7);
  const canchaId = params.cancha ? Number(params.cancha) : null;
  let solicitudes: Array<{
    canchaId: number;
    fecha: string;
    estado: string;
    montoTotalCentavos: number;
    usuarioId: number;
  }> = [];
  let canchas: Array<{ id: number; nombre: string }> = [];
  let nombreSede = `Sede ${sesion.sedeId}`;
  try {
    const [solR, canchasR, sedesR] = await Promise.all([
      // QA-03: los indicadores agregan el mes completo, sin el tope de 100 filas.
      fetch(`${base}/api/solicitudes?mes=${mes}&limite=5000`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      fetch(`${base}/api/canchas?sedeId=${sesion.sedeId}`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
      fetch(`${base}/api/sedes`, { headers: cabeceras, cache: 'no-store' }).catch(() => null),
    ]);
    solicitudes = (
      await jsonSeguro<{ solicitudes: typeof solicitudes }>(solR, { solicitudes: [] })
    ).solicitudes;
    canchas = (await jsonSeguro<{ canchas: typeof canchas }>(canchasR, { canchas: [] })).canchas;
    const sedes = (await jsonSeguro<{ sedes: Array<{ id: number; nombre: string }> }>(sedesR, { sedes: [] })).sedes;
    nombreSede = sedes.find((s) => s.id === sesion.sedeId)?.nombre ?? nombreSede;
  } catch {
    solicitudes = [];
    canchas = [];
  }
  const porCancha = new Map(canchas.map((c) => [c.id, c.nombre]));
  const kpis = calcularKpis(
    solicitudes.map((s) => ({
      ...s,
      canchaNombre: porCancha.get(s.canchaId) ?? `Cancha ${s.canchaId}`,
    })),
    fecha,
    mes,
    canchaId != null && Number.isInteger(canchaId) ? canchaId : null,
  );
  const canchaElegida = canchas.find((c) => c.id === canchaId)?.nombre ?? null;
  return (
    <DisposicionRol actual="/kpis" roles={['ADMIN']}>
      <h1>Indicadores</h1>
      <p className="app-subtitulo">
        {nombreSede} · Ingreso diario y mensual, con detalle por cancha.
      </p>
      <form className="selector-sede" method="get" action="/kpis" aria-label="Filtrar indicadores">
        <label htmlFor="kpi-fecha">Fecha</label>
        <input id="kpi-fecha" name="fecha" type="date" defaultValue={fecha} required />
        <label htmlFor="kpi-mes">Mes</label>
        <input id="kpi-mes" name="mes" type="month" defaultValue={mes} required />
        <label htmlFor="kpi-cancha">Cancha</label>
        <select id="kpi-cancha" name="cancha" defaultValue={params.cancha ?? ''}>
          <option value="">Todas las canchas</option>
          {canchas.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
        <button type="submit" className="boton boton-secundario">
          Ver indicadores
        </button>
      </form>
      <div className="kpi-dashboard">
        <TiraKpis
          kpis={[
            { etiqueta: `Ingreso del ${fecha}`, valor: soles.format(kpis.ingresoDiarioCentavos / 100) },
            { etiqueta: 'Reservas del día', valor: String(kpis.reservasDiarias) },
            { etiqueta: `Ingreso de ${mes}`, valor: soles.format(kpis.ingresoMensualCentavos / 100) },
            { etiqueta: 'Confirmadas del mes', valor: String(kpis.confirmadasMensuales) },
            { etiqueta: 'Ticket promedio mensual', valor: soles.format(kpis.ticketPromedioMensualCentavos / 100) },
            { etiqueta: 'Usuarios activos del mes', valor: String(kpis.usuariosActivosMensuales) },
          ]}
        />
      </div>
      <section className="panel" aria-label="Ingreso mensual por cancha">
        <div className="encabezado-panel">
          <h2>Ingreso por cancha</h2>
          <p>
            {canchaElegida ? `Detalle de ${canchaElegida} en ${mes}.` : `Todas las canchas de ${nombreSede} en ${mes}.`}
          </p>
        </div>
        {kpis.porCancha.length === 0 ? (
          <p role="status">Sin ingresos en el mes seleccionado.</p>
        ) : (
          <ul className="lista-gestion">
            {kpis.porCancha
              .filter((c) => canchaId == null || c.canchaId === canchaId)
              .map((c) => (
                <li key={c.canchaId} className="fila-gestion">
                  <div>
                    <strong>{c.cancha}</strong>
                    <span>
                      Día: {soles.format(c.ingresoDiarioCentavos / 100)} · Mes: {soles.format(c.ingresoMensualCentavos / 100)} ·{' '}
                      {c.confirmadasMensuales} confirmadas
                    </span>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>
    </DisposicionRol>
  );
}
