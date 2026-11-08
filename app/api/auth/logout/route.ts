import { NextRequest } from 'next/server';
import { cabeceraLimpiarSesion, esHttps } from '@/lib/auth/sesion';
import { jsonOk } from '@/lib/auth/http';

// Idempotente y público: limpia aunque no haya sesión (mismos atributos).
export async function POST(peticion: NextRequest): Promise<Response> {
  return jsonOk({ ok: true }, 200, cabeceraLimpiarSesion(esHttps(peticion)));
}
