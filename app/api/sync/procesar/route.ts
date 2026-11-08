import { NextRequest } from 'next/server';
import { jsonError, jsonOk } from '@/lib/auth/http';
import { exigirSesion, leerSesionDeCabecera } from '@/lib/auth/sesion';
import { procesarPendientes } from '@/lib/sync/procesador';

// POST /api/sync/procesar — consume la cola del usuario (procesador offline).
// Idempotente: los ACK ya procesados no vuelven a consumir la cola.
export async function POST(peticion: NextRequest): Promise<Response> {
  try {
    const sesion = exigirSesion(await leerSesionDeCabecera(peticion.headers.get('cookie')));
    const resultados = await procesarPendientes(sesion);
    return jsonOk({ resultados });
  } catch (error) {
    return jsonError(error);
  }
}
