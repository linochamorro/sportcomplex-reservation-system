import {
  calcularClientes,
  calcularEstados,
  calcularIngresos,
  calcularOcupacion,
  type FilaReporte,
  type TipoReporte,
} from './reportes';

/**
 * Render del reporte a PDF (pdfkit). Mismos datos que el CSV y el JSON, con
 * cabeceras, paginación y totales. El texto usa fuentes estándar WinAnsi, que
 * cubren acentos y ñ.
 */

const MARGEN = 40;

type Columna = { titulo: string; clave: string; ancho: number; alinear?: 'right' | 'center' };

type Seccion = { titulo: string; columnas: Columna[]; filas: string[][]; resumen?: string[] };

const soles = (centavos: number) =>
  `S/ ${(centavos / 100).toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DIAS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

function seccionesDe(tipo: TipoReporte, datos: unknown, mes: string, alcance: string): Seccion[] {
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

export async function reporteAPdf(
  tipo: TipoReporte,
  datos: unknown,
  opciones: { mes: string; alcance: string; filas: number; generadoEn: Date },
): Promise<Buffer> {
  const { default: PDFDocument } = await import('pdfkit');
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGEN, bufferPages: true });
  const trozos: Buffer[] = [];
  doc.on('data', (trozo: Buffer) => trozos.push(trozo));
  const fin = new Promise<Buffer>((resolver) => {
    doc.on('end', () => resolver(Buffer.concat(trozos)));
  });

  const secciones = seccionesDe(tipo, datos, opciones.mes, opciones.alcance);
  const anchoUtil = doc.page.width - MARGEN * 2;

  // Encabezado
  doc.fillColor('#14532D').fontSize(16).text('Reporte de uso de canchas', { align: 'left' });
  doc
    .fontSize(9)
    .fillColor('#475569')
    .text(`Mes: ${opciones.mes}   ·   Alcance: ${opciones.alcance}   ·   Generado: ${opciones.generadoEn.toISOString().slice(0, 16).replace('T', ' ')} (hora de Lima)`)
    .text(`Reservas consideradas: ${opciones.filas}`)
    .moveDown(0.8);

  for (const seccion of secciones) {
    // Encabezado de tabla (se repite si la sección pasa de página)
    const dibujarEncabezado = () => {
      doc.fontSize(11).fillColor('#14532D').text(seccion.titulo, { continued: false });
      doc.moveDown(0.3);
      const y = doc.y;
      doc.rect(MARGEN, y, anchoUtil, 16).fill('#E7F6EC');
      let x = MARGEN + 4;
      doc.fillColor('#14532D').fontSize(8);
      for (const col of seccion.columnas) {
        doc.text(col.titulo, x, y + 4, { width: col.ancho - 6, align: col.alinear ?? 'left', lineBreak: false });
        x += col.ancho;
      }
      doc.y = y + 18;
    };
    dibujarEncabezado();

    doc.fontSize(8).fillColor('#1F2937');
    for (const fila of seccion.filas) {
      if (doc.y > doc.page.height - MARGEN - 20) {
        doc.addPage();
        dibujarEncabezado();
        doc.fontSize(8).fillColor('#1F2937');
      }
      const y = doc.y;
      let x = MARGEN + 4;
      seccion.columnas.forEach((col, i) => {
        doc.text(cortar(fila[i] ?? '', col.ancho - 6), x, y, {
          width: col.ancho - 6,
          align: col.alinear ?? 'left',
          lineBreak: false,
          ellipsis: true,
        });
        x += col.ancho;
      });
      doc.y = y + 12;
      // Línea divisoria
      doc.moveTo(MARGEN, doc.y - 2).lineTo(MARGEN + anchoUtil, doc.y - 2).lineWidth(0.3).strokeColor('#DDDDDD').stroke();
      doc.fillColor('#1F2937');
    }
    if (seccion.resumen) {
      doc.moveDown(0.4);
      doc.fontSize(9).fillColor('#14532D').text(seccion.resumen.join('   ·   '));
    }
    doc.moveDown(0.8);
  }

  // Pie con numeración
  const rango = doc.bufferedPageRange();
  for (let i = rango.start; i < rango.start + rango.count; i += 1) {
    doc.switchToPage(i);
    doc
      .fontSize(7)
      .fillColor('#475569')
      .text(
        `Página ${i - rango.start + 1} de ${rango.count}`,
        MARGEN,
        doc.page.height - MARGEN + 8,
        { width: anchoUtil, align: 'center', lineBreak: false },
      );
  }

  doc.end();
  return fin;
}

/** Recorta texto largo para que no invada la columna siguiente. */
function cortar(texto: string, ancho: number): string {
  const maximo = Math.max(6, Math.floor(ancho / 4.6));
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}

export function filasDe(tipo: TipoReporte, datos: unknown): number {
  if (tipo === 'ocupacion') return (datos as FilaReporte[]).length;
  if (tipo === 'ingresos') {
    const d = datos as ReturnType<typeof calcularIngresos>;
    return d.porSede.length + d.porCancha.length;
  }
  if (tipo === 'estados') return (datos as ReturnType<typeof calcularEstados>).filas.length;
  const d = datos as ReturnType<typeof calcularClientes>;
  return d.top.length + d.horasPico.length;
}

export function pdfComoResponse(pdf: Buffer, nombreArchivo: string): Response {
  return new Response(new Uint8Array(pdf), {
    status: 200,
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `attachment; filename="${nombreArchivo}"`,
      'content-length': String(pdf.length),
      'cache-control': 'no-store',
    },
  });
}
