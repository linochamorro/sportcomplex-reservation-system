import { NextRequest, NextResponse } from 'next/server';
import { origenPermitido } from '@/lib/auth/csrf';
import { NOMBRE_COOKIE } from '@/lib/auth/sesion';

// Default-deny en el borde: cada ruta verifica con guards; el proxy solo
// deja pasar sin cookie a la lista pública explícita. Nunca decide autorización.
const RUTAS_API_PUBLICAS = [
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/logout',
  '/api/auth/recuperar',
];

export default async function proxy(peticion: NextRequest) {
  const ruta = peticion.nextUrl.pathname;
  if (!ruta.startsWith('/api/')) return NextResponse.next();
  if (ruta === '/api/mantenimiento') {
    return NextResponse.next();
  }
  if (!origenPermitido(peticion.method, peticion.headers, peticion.nextUrl.host)) {
    return Response.json({ error: 'Origen no permitido' }, { status: 403 });
  }
  if (RUTAS_API_PUBLICAS.some((p) => ruta === p || ruta.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const cookie = peticion.headers.get('cookie') ?? '';
  if (!cookie.includes(`${NOMBRE_COOKIE}=`)) {
    return Response.json({ error: 'No autenticado' }, { status: 401 });
  }
  return NextResponse.next();
}

export const config = { matcher: ['/api/:path*'] };
