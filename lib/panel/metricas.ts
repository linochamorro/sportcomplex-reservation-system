export type SolicitudNegocio = {
  estado: string;
  montoTotalCentavos: number;
  sedeId: number | null;
  sedeNombre: string;
  canchaId: number;
  canchaNombre: string;
};

export type TotalesNegocio = { sedes: number; canchas: number; usuarios?: number };

export type MetricasNegocio = {
  totales: TotalesNegocio;
  confirmadas: number;
  pendientes: number;
  noShow: number;
  ingresosCentavos: number;
  ticketPromedioCentavos: number;
  tasaConfirmacion: number;
  topSedes: Array<{ sedeId: number | null; sede: string; confirmadas: number; ingresosCentavos: number }>;
  topCanchas: Array<{ canchaId: number; cancha: string; confirmadas: number; ingresosCentavos: number }>;
};

function ordenarRank<T extends { confirmadas: number; ingresosCentavos: number; nombre: string }>(filas: T[]): T[] {
  return [...filas].sort(
    (a, b) => b.confirmadas - a.confirmadas || b.ingresosCentavos - a.ingresosCentavos || a.nombre.localeCompare(b.nombre),
  );
}

export function calcularMetricas(solicitudes: SolicitudNegocio[], totales: TotalesNegocio): MetricasNegocio {
  const confirmadas = solicitudes.filter((s) => s.estado === 'CONFIRMADA');
  const pendientes = solicitudes.filter((s) => s.estado === 'PENDIENTE').length;
  const noShow = solicitudes.filter((s) => s.estado === 'NO_SHOW').length;
  const decididas = solicitudes.filter((s) => s.estado !== 'PENDIENTE').length;
  const ingresosCentavos = confirmadas.reduce((a, s) => a + s.montoTotalCentavos, 0);
  const porSede = new Map<number | null, { sedeId: number | null; sede: string; confirmadas: number; ingresosCentavos: number }>();
  const porCancha = new Map<number, { canchaId: number; cancha: string; confirmadas: number; ingresosCentavos: number }>();
  for (const s of confirmadas) {
    const sede = porSede.get(s.sedeId) ?? { sedeId: s.sedeId, sede: s.sedeNombre, confirmadas: 0, ingresosCentavos: 0 };
    sede.confirmadas += 1;
    sede.ingresosCentavos += s.montoTotalCentavos;
    porSede.set(s.sedeId, sede);
    const cancha = porCancha.get(s.canchaId) ?? {
      canchaId: s.canchaId,
      cancha: s.canchaNombre,
      confirmadas: 0,
      ingresosCentavos: 0,
    };
    cancha.confirmadas += 1;
    cancha.ingresosCentavos += s.montoTotalCentavos;
    porCancha.set(s.canchaId, cancha);
  }
  const topSedes = ordenarRank(
    [...porSede.values()].map((s) => ({ ...s, nombre: s.sede })),
  ).slice(0, 3);
  const topCanchas = ordenarRank(
    [...porCancha.values()].map((c) => ({ ...c, nombre: c.cancha })),
  ).slice(0, 3);

  return {
    totales,
    confirmadas: confirmadas.length,
    pendientes,
    noShow,
    ingresosCentavos,
    ticketPromedioCentavos: confirmadas.length === 0 ? 0 : Math.round(ingresosCentavos / confirmadas.length),
    tasaConfirmacion: decididas === 0 ? 0 : confirmadas.length / decididas,
    topSedes: topSedes.map(({ nombre, ...resto }) => ({ ...resto, sede: nombre })),
    topCanchas: topCanchas.map(({ nombre, ...resto }) => ({ ...resto, cancha: nombre })),
  };
}
