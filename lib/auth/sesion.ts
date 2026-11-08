import { jwtVerify, SignJWT } from 'jose';
import { bd } from '../db/cliente';
import type { Rol } from '../db/generated/client';

export const NOMBRE_COOKIE = 'access_token';
export const SEGUNDOS_SESION = 1800;

export class HttpError extends Error {
  readonly estado: number;
  constructor(estado: number, mensaje: string) {
    super(mensaje);
    this.estado = estado;
  }
}

export type Sesion = { id: number; rol: Rol; sedeId: number | null };

function obtenerSecreto(): Uint8Array {
  const secreto = process.env.JWT_SECRET;
  if (!secreto || secreto.length < 32) {
    throw new HttpError(500, 'Configuración de sesión ausente');
  }
  return new TextEncoder().encode(secreto);
}

export async function firmarSesion(sub: number): Promise<string> {
  return new SignJWT({ sub: String(sub) })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SEGUNDOS_SESION}s`)
    .sign(obtenerSecreto());
}

function extraerToken(cabeceraCookie: string | null): string | null {
  if (!cabeceraCookie) return null;
  const partes = cabeceraCookie.split(';').map((p) => p.trim().split('='));
  const hallada = partes.find(([nombre]) => nombre === NOMBRE_COOKIE);
  return hallada?.[1] ?? null;
}

/** Lee identidad del JWT pero decide sobre la fila fresca. JWT = transporte, nunca autorización. */
export async function leerSesionDeCabecera(cabeceraCookie: string | null): Promise<Sesion | null> {
  const token = extraerToken(cabeceraCookie);
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, obtenerSecreto(), { algorithms: ['HS256'] });
    const id = Number(payload.sub);
    if (!Number.isInteger(id)) return null;
    const usuario = await bd.usuario.findUnique({
      where: { id },
      select: { id: true, rol: true, sedeId: true },
    });
    if (!usuario) return null;
    return { id: usuario.id, rol: usuario.rol, sedeId: usuario.sedeId };
  } catch {
    return null;
  }
}

export function exigirSesion(sesion: Sesion | null): Sesion {
  if (!sesion) throw new HttpError(401, 'No autenticado');
  return sesion;
}

export function exigirRol(sesion: Sesion | null, ...roles: Rol[]): Sesion {
  const valida = exigirSesion(sesion);
  if (!roles.includes(valida.rol)) throw new HttpError(403, 'Sin permiso');
  return valida;
}

/** Sede operativa del actor. SUPERADMIN no tiene sede propia: debe indicarla por recurso. */
export function exigirSede(sesion: Sesion | null): number {
  const valida = exigirSesion(sesion);
  if (valida.sedeId == null) throw new HttpError(403, 'Sin sede asignada');
  return valida.sedeId;
}

/** Autorización a nivel objeto: el recurso debe pertenecer a la sede del actor. SUPERADMIN exento. */
export function exigirSedeRecurso(sesion: Sesion | null, sedeIdRecurso: number): void {
  const valida = exigirSesion(sesion);
  if (valida.rol === 'SUPERADMIN') return;
  if (valida.sedeId == null || valida.sedeId !== sedeIdRecurso) {
    throw new HttpError(403, 'Sin permiso sobre esta sede');
  }
}

function atributosCookie(segura: boolean, maxEdad: number): string {
  const flag = segura ? '; Secure' : '';
  return `Path=/; HttpOnly; SameSite=Lax${flag}; Max-Age=${maxEdad}`;
}

export function cabeceraFijarSesion(token: string, segura = false): string {
  return `${NOMBRE_COOKIE}=${token}; ${atributosCookie(segura, SEGUNDOS_SESION)}`;
}

export function cabeceraLimpiarSesion(segura = false): string {
  return `${NOMBRE_COOKIE}=; ${atributosCookie(segura, 0)}`;
}

export function esHttps(peticion: {
  headers: { get(nombre: string): string | null };
  nextUrl?: { protocol: string; host?: string };
}): boolean {
  if (peticion.headers.get('x-forwarded-proto') === 'https') return true;
  if (peticion.nextUrl?.protocol === 'https:') return true;
  if (process.env.NODE_ENV !== 'production') return false;
  const host = peticion.nextUrl?.host;
  return !(
    process.env.PLAYWRIGHT_E2E_INSECURE_COOKIES === '1' &&
    (host === '127.0.0.1:3100' || host === 'localhost:3100')
  );
}
