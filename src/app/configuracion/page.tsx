import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { DisposicionRol } from '@/components/layout/DisposicionRol';
import { PanelUsuario } from './PanelUsuario';
import { PanelAdministracion } from './PanelAdministracion';
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
    return <PanelUsuario solicitudes={solicitudes} notificaciones={notificaciones} canchas={canchasPorSede.flat()} />;
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

  return <PanelAdministracion rol={sesion.rol} fecha={fecha} filtroSede={filtroSede} sedeOperativa={sedeOperativa} sedes={sedes} metricas={metricas} ingresoMensual={ingresoMensual} clientesActivos={clientesActivos} resumen={resumen} delDia={delDia} />;
}
