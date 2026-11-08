export type SolicitudKpi = {
  canchaId: number;
  canchaNombre: string;
  fecha: string;
  estado: string;
  montoTotalCentavos: number;
  usuarioId: number;
};

export type KpisMensuales = {
  ingresoDiarioCentavos: number;
  reservasDiarias: number;
  ingresoMensualCentavos: number;
  confirmadasMensuales: number;
  ticketPromedioMensualCentavos: number;
  usuariosActivosMensuales: number;
  porCancha: Array<{
    canchaId: number;
    cancha: string;
    ingresoDiarioCentavos: number;
    ingresoMensualCentavos: number;
    confirmadasMensuales: number;
  }>;
};

export function calcularKpis(
  solicitudes: SolicitudKpi[],
  fecha: string,
  mes: string,
  canchaId: number | null,
): KpisMensuales {
  const delDia = solicitudes.filter(
    (s) => s.fecha === fecha && (canchaId == null || s.canchaId === canchaId),
  );
  const delMes = solicitudes.filter(
    (s) => s.fecha.startsWith(mes) && (canchaId == null || s.canchaId === canchaId),
  );
  const confirmadasMes = delMes.filter((s) => s.estado === 'CONFIRMADA');
  const ingresoMensual = confirmadasMes.reduce((a, s) => a + s.montoTotalCentavos, 0);
  const usuarios = new Set(
    delMes.filter((s) => s.estado === 'PENDIENTE' || s.estado === 'CONFIRMADA').map((s) => s.usuarioId),
  );
  const porCancha = new Map<number, KpisMensuales['porCancha'][number]>();
  for (const s of solicitudes.filter((x) => x.fecha.startsWith(mes))) {
    const fila = porCancha.get(s.canchaId) ?? {
      canchaId: s.canchaId,
      cancha: s.canchaNombre,
      ingresoDiarioCentavos: 0,
      ingresoMensualCentavos: 0,
      confirmadasMensuales: 0,
    };
    if (s.estado === 'CONFIRMADA') {
      fila.confirmadasMensuales += 1;
      fila.ingresoMensualCentavos += s.montoTotalCentavos;
      if (s.fecha === fecha) fila.ingresoDiarioCentavos += s.montoTotalCentavos;
    }
    porCancha.set(s.canchaId, fila);
  }
  return {
    ingresoDiarioCentavos: delDia
      .filter((s) => s.estado === 'CONFIRMADA')
      .reduce((a, s) => a + s.montoTotalCentavos, 0),
    reservasDiarias: delDia.length,
    ingresoMensualCentavos: ingresoMensual,
    confirmadasMensuales: confirmadasMes.length,
    ticketPromedioMensualCentavos:
      confirmadasMes.length === 0 ? 0 : Math.round(ingresoMensual / confirmadasMes.length),
    usuariosActivosMensuales: usuarios.size,
    porCancha: [...porCancha.values()].sort((a, b) => b.ingresoMensualCentavos - a.ingresoMensualCentavos),
  };
}
