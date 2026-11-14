import { seccionesDe } from './secciones-pdf';
import type { TipoReporte } from './reportes';
const MARGEN = 40;
function cortar(texto: string, ancho: number): string {
  const maximo = Math.max(6, Math.floor(ancho / 4.6));
  return texto.length <= maximo ? texto : `${texto.slice(0, maximo - 1)}…`;
}

export async function renderReportePdf(
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
