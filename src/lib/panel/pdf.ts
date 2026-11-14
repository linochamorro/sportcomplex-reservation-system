import { renderReportePdf } from './render-pdf';
import { calcularClientes, calcularEstados, calcularIngresos, type FilaReporte, type TipoReporte } from './reportes';

export function reporteAPdf(tipo: TipoReporte, datos: unknown, opciones: { mes: string; alcance: string; filas: number; generadoEn: Date }): Promise<Buffer> {
  return renderReportePdf(tipo, datos, opciones);
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
  return new Response(new Uint8Array(pdf), { status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename=\"${nombreArchivo}\"`, 'content-length': String(pdf.length), 'cache-control': 'no-store' } });
}
