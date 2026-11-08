import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import {
  calcularClientes,
  calcularEstados,
  calcularIngresos,
  calcularOcupacion,
  reporteACsv,
  type FilaReporte,
  type TipoReporte,
} from '@/lib/panel/reportes';

const TIPOS: TipoReporte[] = ['ocupacion', 'ingresos', 'estados', 'clientes'];
const MES = /^\d{4}-(0[1-9]|1[0-2])$/;

// GET /api/reportes?tipo=&mes=&sedeId=&formato= — ADMIN ve su sede; SUPERADMIN
// global o una sede. Consulta directo a BD (sin tope de 100 filas) para que los
// cuadros de uso reflejen el mes completo. formato=csv|pdf descarga el cuadro.
export async function GET(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'ADMIN', 'SUPERADMIN');
    const params = peticion.nextUrl.searchParams;
    const tipo = params.get('tipo') ?? 'ingresos';
    const mes = params.get('mes') ?? '';
    const formato = params.get('formato') ?? 'json';
    if (!TIPOS.includes(tipo as TipoReporte) || !MES.test(mes) || !['json', 'csv', 'pdf'].includes(formato)) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const sedeParam = params.get('sedeId');
    const sedeId = sedeParam == null || sedeParam === '' ? null : Number(sedeParam);
    if (sedeId != null && !Number.isInteger(sedeId)) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    if (sesion.rol === 'ADMIN') {
      if (sedeId != null && sedeId !== sesion.sedeId) {
        return Response.json({ error: 'Sin permiso sobre esta sede' }, { status: 403 });
      }
    }
    const sedeEfectiva = sesion.rol === 'ADMIN' ? (sesion.sedeId ?? -1) : (sedeId ?? null);
    // QA-05: una sola consulta SQL (joins en BD) en vez de findMany + includes
    // (3 round-trips). El índice Solicitud_fecha_idx cubre el filtro por mes.
    const patron = `${mes}%`;
    type FilaSql = {
      fecha: string;
      horaInicio: string;
      estado: string;
      montoTotalCentavos: number;
      usuarioId: number;
      canchaId: number;
      cancha: string;
      sedeId: number;
      sede: string;
      usuarioNombre: string;
      usuarioEmail: string;
    };
    const filasSql =
      sedeEfectiva == null
        ? await bd.$queryRaw<FilaSql[]>`
      SELECT s.fecha, s."horaInicio", s.estado, s."montoTotalCentavos", s."usuarioId",
        c.id AS "canchaId", c.nombre AS cancha, se.id AS "sedeId", se.nombre AS sede,
        u.nombre AS "usuarioNombre", u.email AS "usuarioEmail"
      FROM "Solicitud" s
      JOIN "Cancha" c ON c.id = s."canchaId" AND c."eliminadoEn" IS NULL
      JOIN "Sede" se ON se.id = c."sedeId"
      JOIN "Usuario" u ON u.id = s."usuarioId"
      WHERE s."eliminadoEn" IS NULL AND s.fecha LIKE ${patron}
      ORDER BY s.fecha, s."horaInicio"`
        : await bd.$queryRaw<FilaSql[]>`
      SELECT s.fecha, s."horaInicio", s.estado, s."montoTotalCentavos", s."usuarioId",
        c.id AS "canchaId", c.nombre AS cancha, se.id AS "sedeId", se.nombre AS sede,
        u.nombre AS "usuarioNombre", u.email AS "usuarioEmail"
      FROM "Solicitud" s
      JOIN "Cancha" c ON c.id = s."canchaId" AND c."eliminadoEn" IS NULL
      JOIN "Sede" se ON se.id = c."sedeId"
      JOIN "Usuario" u ON u.id = s."usuarioId"
      WHERE s."eliminadoEn" IS NULL AND s.fecha LIKE ${patron} AND se.id = ${sedeEfectiva}
      ORDER BY s.fecha, s."horaInicio"`;
    const filas: FilaReporte[] = filasSql.map((s) => ({
      sedeId: Number(s.sedeId),
      sede: s.sede,
      canchaId: Number(s.canchaId),
      cancha: s.cancha,
      fecha: s.fecha,
      horaInicio: s.horaInicio,
      estado: s.estado,
      montoTotalCentavos: Number(s.montoTotalCentavos),
      usuarioId: Number(s.usuarioId),
      usuarioNombre: s.usuarioNombre,
      usuarioEmail: s.usuarioEmail,
    }));
    const datos =
      tipo === 'ocupacion'
        ? calcularOcupacion(filas)
        : tipo === 'ingresos'
          ? calcularIngresos(filas)
          : tipo === 'estados'
            ? calcularEstados(filas)
            : calcularClientes(filas);
    if (formato === 'csv') {
      return new Response(reporteACsv(tipo as TipoReporte, datos), {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="reporte-${tipo}-${mes}.csv"`,
        },
      });
    }
    if (formato === 'pdf') {
      const { pdfComoResponse, reporteAPdf } = await import('@/lib/panel/pdf');
      const nombres = new Map(filasSql.map((f) => [Number(f.sedeId), f.sede]));
      const alcance = sedeEfectiva == null ? 'Todas las sedes' : (nombres.get(sedeEfectiva) ?? `Sede ${sedeEfectiva}`);
      const pdf = await reporteAPdf(tipo as TipoReporte, datos, {
        mes,
        alcance,
        filas: filas.length,
        generadoEn: new Date(),
      });
      return pdfComoResponse(pdf, `reporte-${tipo}-${mes}.pdf`);
    }
    return jsonOk({ tipo, mes, sedeId: sedeEfectiva, datos });
  } catch (error) {
    return jsonError(error);
  }
}
