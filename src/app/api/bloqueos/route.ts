import { NextRequest } from 'next/server';
import { bd } from '@/lib/db/cliente';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirRol, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { crearBloqueoTx } from '@/lib/domain/bloqueos-tx';

// GET /api/bloqueos?sedeId=&fecha= — ADMIN ve su sede; SUPERADMIN filtra o todo.
export async function GET(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'ADMIN', 'SUPERADMIN');
    const sedeId = Number(peticion.nextUrl.searchParams.get('sedeId'));
    const fecha = peticion.nextUrl.searchParams.get('fecha') ?? '';
    const sedeEfectiva = sesion.rol === 'ADMIN' ? sesion.sedeId : Number.isInteger(sedeId) ? sedeId : null;
    if (sedeEfectiva == null) return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    const bloqueos = await bd.bloqueoCancha.findMany({
      where: {
        cancha: { sedeId: sedeEfectiva },
        ...(fecha ? { fecha } : {}),
        eliminadoEn: null,
      },
      orderBy: { creadoEn: 'desc' },
      take: 100,
    });
    return jsonOk({ bloqueos });
  } catch (error) {
    return jsonError(error);
  }
}

// POST /api/bloqueos — crea un bloqueo y cancela los holds PENDIENTE que solapa.
export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirRol(await leerSesionDeCabecera(peticion.headers.get('cookie')), 'ADMIN', 'SUPERADMIN');
    const cuerpo = (await peticion.json().catch(() => null)) as {
      canchaId?: unknown;
      fecha?: unknown;
      horaInicio?: unknown;
      horaFin?: unknown;
      motivo?: unknown;
    } | null;
    const canchaId = Number(cuerpo?.canchaId);
    if (!Number.isInteger(canchaId) || canchaId < 1) {
      return Response.json({ error: 'Datos inválidos' }, { status: 400 });
    }
    const resultado = await bd.$transaction((tx) =>
      crearBloqueoTx(tx, sesion, {
        canchaId,
        fecha: String(cuerpo?.fecha ?? ''),
        horaInicio: cuerpo?.horaInicio,
        horaFin: cuerpo?.horaFin,
        motivo: cuerpo?.motivo,
      }),
    );
    return jsonOk(resultado, 201);
  } catch (error) {
    return jsonError(error);
  }
}
