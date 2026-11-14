import { createHash, timingSafeEqual } from 'node:crypto';
import { NextRequest } from 'next/server';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { liberarVencidas } from '@/lib/domain/liberar';
import { revisarRecordatorios } from '@/lib/domain/recordatorios';
import { bd } from '@/lib/db/cliente';
import { purgarOperacionesAntiguas, purgarRegistroAntiguo } from '@/lib/sync/mantenimiento';

/**
 * Mantenimiento del reloj servidor: libera holds vencidos y purga lo antiguo.
 * Lo invoca un cron externo (Vercel) con `CRON_SECRET`; fail-closed si falta.
 * También puede invocarse manualmente en desarrollo con el mismo Bearer.
 */
export async function GET(peticion: NextRequest): Promise<Response> {
  return ejecutarMantenimiento(peticion);
}

export async function POST(peticion: NextRequest): Promise<Response> {
  return ejecutarMantenimiento(peticion);
}

async function ejecutarMantenimiento(peticion: NextRequest): Promise<Response> {
  try {
    const esperado = process.env.CRON_SECRET;
    if (!esperado || esperado.length < 16) {
      return Response.json({ error: 'Mantenimiento no configurado' }, { status: 503 });
    }
    const cabecera = peticion.headers.get('authorization') ?? '';
    const prefijo = 'Bearer ';
    const recibido = cabecera.startsWith(prefijo) ? cabecera.slice(prefijo.length) : '';
    const digestEsperado = createHash('sha256').update(esperado).digest();
    const digestRecibido = createHash('sha256').update(recibido).digest();
    if (!timingSafeEqual(digestRecibido, digestEsperado)) {
      return Response.json({ error: 'No autorizado' }, { status: 401 });
    }
    const liberadas = await liberarVencidas();
    const recordatorios = await bd.$transaction((tx) => revisarRecordatorios(tx));
    const operacionesPurgadas = await purgarOperacionesAntiguas();
    const cambiosPurgados = await purgarRegistroAntiguo();
    return jsonOk({ liberadas, recordatorios, operacionesPurgadas, cambiosPurgados });
  } catch (error) {
    return jsonError(error);
  }
}
