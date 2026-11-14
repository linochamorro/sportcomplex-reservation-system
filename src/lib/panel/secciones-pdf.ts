import { calcularClientes, calcularEstados, calcularIngresos, calcularOcupacion, type TipoReporte } from './reportes';

type Columna = { titulo: string; clave: string; ancho: number; alinear?: 'right' | 'center' };
export type Seccion = { titulo: string; columnas: Columna[]; filas: string[][]; resumen?: string[] };
const soles = (centavos: number) => `S/ ${(centavos / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export function seccionesDe(tipo: TipoReporte, datos: unknown, mes: string, alcance: string): Seccion[] {
  if (tipo === 'ingresos') {
    const { porSede, porCancha } = datos as ReturnType<typeof calcularIngresos>;
    const total = porSede.reduce((a, s) => a + s.ingresosCentavos, 0);
    return [
      {
        titulo: 'Ingresos por sede',
        columnas: [
          { titulo: 'Sede', clave: 'sede', ancho: 200 },
          { titulo: 'Confirmadas', clave: 'n', ancho: 90, alinear: 'right' },
          { titulo: 'Ingreso', clave: 'm', ancho: 110, alinear: 'right' },
          { titulo: 'Ticket prom.', clave: 't', ancho: 110, alinear: 'right' },
        ],
        filas: porSede.map((s) => [s.sede, String(s.confirmadas), soles(s.ingresosCentavos), soles(s.ticketPromedioCentavos)]),
        resumen: [`TOTAL ${mes}: ${soles(total)}`],
      },
      {
        titulo: 'Ingresos por cancha',
        columnas: [
          { titulo: 'Sede', clave: 'sede', ancho: 160 },
          { titulo: 'Cancha', clave: 'cancha', ancho: 150 },
          { titulo: 'Confirmadas', clave: 'n', ancho: 90, alinear: 'right' },
          { titulo: 'Ingreso', clave: 'm', ancho: 110, alinear: 'right' },
        ],
        filas: porCancha.map((c) => [c.sede, c.cancha, String(c.confirmadas), soles(c.ingresosCentavos)]),
      },
    ];
  }
  if (tipo === 'ocupacion') {
    const filas = datos as ReturnType<typeof calcularOcupacion>;
    return [
      {
        titulo: 'Ocupacion por turno',
        columnas: [
          { titulo: 'Sede', clave: 'sede', ancho: 130 },
          { titulo: 'Cancha', clave: 'cancha', ancho: 110 },
          { titulo: 'Fecha', clave: 'fecha', ancho: 90 },
          { titulo: 'Dia', clave: 'dia', ancho: 45, alinear: 'center' },
          { titulo: 'Hora', clave: 'hora', ancho: 60 },
          { titulo: 'Reservas', clave: 'n', ancho: 70, alinear: 'right' },
          { titulo: 'Ingreso', clave: 'm', ancho: 90, alinear: 'right' },
        ],
        filas: filas.map((f) => [
          f.sede,
          f.cancha,
          f.fecha,
          DIAS[f.diaSemana] ?? '',
          f.horaInicio,
          String(f.reservas),
          soles(f.ingresosCentavos),
        ]),
        resumen: [`Turnos con uso: ${filas.length}`],
      },
    ];
  }
  if (tipo === 'estados') {
    const { filas, total } = datos as ReturnType<typeof calcularEstados>;
    return [
      {
        titulo: 'Reservas por estado',
        columnas: [
          { titulo: 'Sede', clave: 'sede', ancho: 200 },
          { titulo: 'Estado', clave: 'estado', ancho: 140 },
          { titulo: 'Total', clave: 'n', ancho: 80, alinear: 'right' },
          { titulo: 'Tasa', clave: 't', ancho: 90, alinear: 'right' },
        ],
        filas: filas.map((f) => [
          f.sede,
          f.estado,
          String(f.total),
          `${(f.tasa * 100).toFixed(1)} %`,
        ]),
        resumen: [`Total de reservas del mes: ${total}`],
      },
    ];
  }
  const { top, horasPico } = datos as ReturnType<typeof calcularClientes>;
  return [
    {
      titulo: 'Mejores clientes',
      columnas: [
        { titulo: 'Cliente', clave: 'nombre', ancho: 170 },
        { titulo: 'Correo', clave: 'email', ancho: 200 },
        { titulo: 'Reservas', clave: 'n', ancho: 80, alinear: 'right' },
        { titulo: 'Confirmadas', clave: 'c', ancho: 90, alinear: 'right' },
        { titulo: 'Ingreso', clave: 'm', ancho: 100, alinear: 'right' },
      ],
      filas: top.map((c) => [c.usuarioNombre, c.usuarioEmail, String(c.reservas), String(c.confirmadas), soles(c.ingresosCentavos)]),
    },
    {
      titulo: 'Horarios pico',
      columnas: [
        { titulo: 'Hora', clave: 'hora', ancho: 100 },
        { titulo: 'Reservas de uso', clave: 'n', ancho: 140, alinear: 'right' },
      ],
      filas: horasPico.map((h) => [h.horaInicio, String(h.reservas)]),
    },
  ];
}
