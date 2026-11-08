// Cuadros de uso para /reportes y exportación CSV. Funciones puras sobre filas
// ya filtradas por alcance (ADMIN: su sede; SUPERADMIN: global o una sede).
// A diferencia del Dashboard, aquí no hay tope de 100 filas: la API consulta
// directo a BD con el filtro de mes.

import { diaSemanaDe } from '../domain/turnos';

export type FilaReporte = {
  sedeId: number;
  sede: string;
  canchaId: number;
  cancha: string;
  fecha: string;
  horaInicio: string;
  estado: string;
  montoTotalCentavos: number;
  usuarioId: number;
  usuarioNombre: string;
  usuarioEmail: string;
};

export type TipoReporte = 'ocupacion' | 'ingresos' | 'estados' | 'clientes';

const USO = new Set(['PENDIENTE', 'CONFIRMADA', 'NO_SHOW']);

export type FilaOcupacion = {
  sede: string;
  cancha: string;
  fecha: string;
  diaSemana: number;
  horaInicio: string;
  reservas: number;
  ingresosCentavos: number;
};

export function calcularOcupacion(filas: FilaReporte[]): FilaOcupacion[] {
  const mapa = new Map<string, FilaOcupacion>();
  for (const f of filas) {
    if (!USO.has(f.estado)) continue;
    const clave = `${f.canchaId}|${f.fecha}|${f.horaInicio}`;
    const actual = mapa.get(clave) ?? {
      sede: f.sede,
      cancha: f.cancha,
      fecha: f.fecha,
      diaSemana: diaSemanaDe(f.fecha),
      horaInicio: f.horaInicio,
      reservas: 0,
      ingresosCentavos: 0,
    };
    actual.reservas += 1;
    if (f.estado === 'CONFIRMADA') actual.ingresosCentavos += f.montoTotalCentavos;
    mapa.set(clave, actual);
  }
  return [...mapa.values()].sort(
    (a, b) => a.fecha.localeCompare(b.fecha) || a.horaInicio.localeCompare(b.horaInicio) || a.cancha.localeCompare(b.cancha),
  );
}

export type FilaIngresoSede = {
  sede: string;
  confirmadas: number;
  ingresosCentavos: number;
  ticketPromedioCentavos: number;
};

export type FilaIngresoCancha = {
  sede: string;
  cancha: string;
  confirmadas: number;
  ingresosCentavos: number;
};

export function calcularIngresos(filas: FilaReporte[]): { porSede: FilaIngresoSede[]; porCancha: FilaIngresoCancha[] } {
  const sedes = new Map<string, FilaIngresoSede>();
  const canchas = new Map<number, FilaIngresoCancha>();
  for (const f of filas) {
    if (f.estado !== 'CONFIRMADA') continue;
    const s = sedes.get(f.sede) ?? { sede: f.sede, confirmadas: 0, ingresosCentavos: 0, ticketPromedioCentavos: 0 };
    s.confirmadas += 1;
    s.ingresosCentavos += f.montoTotalCentavos;
    sedes.set(f.sede, s);
    const c = canchas.get(f.canchaId) ?? { sede: f.sede, cancha: f.cancha, confirmadas: 0, ingresosCentavos: 0 };
    c.confirmadas += 1;
    c.ingresosCentavos += f.montoTotalCentavos;
    canchas.set(f.canchaId, c);
  }
  const porSede = [...sedes.values()].map((s) => ({
    ...s,
    ticketPromedioCentavos: s.confirmadas === 0 ? 0 : Math.round(s.ingresosCentavos / s.confirmadas),
  }));
  porSede.sort((a, b) => b.ingresosCentavos - a.ingresosCentavos);
  const porCancha = [...canchas.values()].sort((a, b) => b.ingresosCentavos - a.ingresosCentavos);
  return { porSede, porCancha };
}

export type FilaEstado = { sede: string; estado: string; total: number; tasa: number };

export function calcularEstados(filas: FilaReporte[]): { filas: FilaEstado[]; total: number } {
  const porSede = new Map<string, Map<string, number>>();
  for (const f of filas) {
    const estados = porSede.get(f.sede) ?? new Map<string, number>();
    estados.set(f.estado, (estados.get(f.estado) ?? 0) + 1);
    porSede.set(f.sede, estados);
  }
  const filasSalida: FilaEstado[] = [];
  let total = 0;
  for (const [sede, estados] of porSede) {
    const totalSede = [...estados.values()].reduce((a, b) => a + b, 0);
    total += totalSede;
    for (const [estado, n] of estados) {
      filasSalida.push({ sede, estado, total: n, tasa: totalSede === 0 ? 0 : n / totalSede });
    }
  }
  filasSalida.sort((a, b) => a.sede.localeCompare(b.sede) || a.estado.localeCompare(b.estado));
  return { filas: filasSalida, total };
}

export type FilaCliente = {
  usuarioNombre: string;
  usuarioEmail: string;
  reservas: number;
  confirmadas: number;
  ingresosCentavos: number;
};

export type FilaHoraPico = { horaInicio: string; reservas: number };

export function calcularClientes(filas: FilaReporte[]): { top: FilaCliente[]; horasPico: FilaHoraPico[] } {
  const clientes = new Map<number, FilaCliente>();
  const horas = new Map<string, number>();
  for (const f of filas) {
    const c = clientes.get(f.usuarioId) ?? {
      usuarioNombre: f.usuarioNombre,
      usuarioEmail: f.usuarioEmail,
      reservas: 0,
      confirmadas: 0,
      ingresosCentavos: 0,
    };
    c.reservas += 1;
    if (f.estado === 'CONFIRMADA') {
      c.confirmadas += 1;
      c.ingresosCentavos += f.montoTotalCentavos;
    }
    clientes.set(f.usuarioId, c);
    if (USO.has(f.estado)) horas.set(f.horaInicio, (horas.get(f.horaInicio) ?? 0) + 1);
  }
  const top = [...clientes.values()].sort((a, b) => b.reservas - a.reservas || b.ingresosCentavos - a.ingresosCentavos).slice(0, 10);
  const horasPico = [...horas.entries()]
    .map(([horaInicio, reservas]) => ({ horaInicio, reservas }))
    .sort((a, b) => b.reservas - a.reservas || a.horaInicio.localeCompare(b.horaInicio));
  return { top, horasPico };
}

function celda(valor: string | number): string {
  const texto = String(valor);
  return /[;"\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function reporteACsv(tipo: TipoReporte, datos: unknown): string {
  const lineas: string[] = [];
  if (tipo === 'ocupacion') {
    lineas.push('sede;cancha;fecha;dia_semana;hora_inicio;reservas;ingresos_centavos');
    for (const f of datos as FilaOcupacion[]) {
      lineas.push([f.sede, f.cancha, f.fecha, f.diaSemana, f.horaInicio, f.reservas, f.ingresosCentavos].map(celda).join(';'));
    }
  } else if (tipo === 'ingresos') {
    lineas.push('nivel;nombre;sede;confirmadas;ingresos_centavos;ticket_promedio_centavos');
    const { porSede, porCancha } = datos as { porSede: FilaIngresoSede[]; porCancha: FilaIngresoCancha[] };
    for (const s of porSede) {
      lineas.push(['sede', s.sede, s.sede, s.confirmadas, s.ingresosCentavos, s.ticketPromedioCentavos].map(celda).join(';'));
    }
    for (const c of porCancha) {
      lineas.push(['cancha', c.cancha, c.sede, c.confirmadas, c.ingresosCentavos, ''].map(celda).join(';'));
    }
  } else if (tipo === 'estados') {
    lineas.push('sede;estado;total;tasa');
    for (const f of (datos as { filas: FilaEstado[] }).filas) {
      lineas.push([f.sede, f.estado, f.total, f.tasa.toFixed(4)].map(celda).join(';'));
    }
  } else {
    lineas.push('seccion;nombre;email;hora_inicio;reservas;confirmadas;ingresos_centavos');
    const { top, horasPico } = datos as { top: FilaCliente[]; horasPico: FilaHoraPico[] };
    for (const c of top) {
      lineas.push(['cliente', c.usuarioNombre, c.usuarioEmail, '', c.reservas, c.confirmadas, c.ingresosCentavos].map(celda).join(';'));
    }
    for (const h of horasPico) {
      lineas.push(['hora_pico', '', '', h.horaInicio, h.reservas, '', ''].map(celda).join(';'));
    }
  }
  return `\uFEFF${lineas.join('\n')}\n`;
}
