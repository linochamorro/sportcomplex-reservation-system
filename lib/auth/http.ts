import { HttpError } from './sesion';
import { clasificarError } from '../http/clasificar-error';

export function jsonOk(datos: unknown, estado = 200, setCookie?: string): Response {
  const cabeceras: Record<string, string> = { 'content-type': 'application/json' };
  if (setCookie) cabeceras['set-cookie'] = setCookie;
  return Response.json(datos, { status: estado, headers: cabeceras });
}

export function esConflictoUnico(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
}

/**
 * Frontera única de errores de la API.
 *
 * Contrato hacia el cliente:
 * - 4xx de dominio (`HttpError`): sale su mensaje, escrito para el usuario.
 * - 5xx: nunca sale su mensaje; puede traer configuración o datos internos. El
 *   estado se respeta, así un `HttpError(503, ...)` sigue siendo 503 y el
 *   cliente puede reintentar en vez de报告显示 algo que no va a mejorar.
 * - Invariante para el cliente: `reintentable` es `true` si y solo si el estado
 *   es 503. Cualquier otro 5xx significa "no lo intentes otra vez todavía".
 *
 * El log lleva `codigo` y `nombre` del error, nunca el mensaje: ahí es donde
 * suele venir la cadena de conexión con la contraseña.
 */
export function jsonError(error: unknown): Response {
  if (error instanceof HttpError) {
    if (error.estado < 500) return Response.json({ error: error.message }, { status: error.estado });
    registrar(`http_${error.estado}`, 'ERROR_DE_DOMINIO', error);
    return CuerpoError(error.estado, 'Error interno', 'ERROR_DE_DOMINIO');
  }
  const clasificada = clasificarError(error);
  registrar(eventoDe(clasificada.estado), clasificada.codigo, error);
  return CuerpoError(clasificada.estado, clasificada.mensaje, clasificada.codigo);
}

function CuerpoError(estado: number, mensaje: string, codigo: string): Response {
  return Response.json({ error: mensaje, codigo, reintentable: estado === 503 }, { status: estado });
}

function eventoDe(estado: number): string {
  if (estado === 503) return 'error_transitorio';
  if (estado === 500) return 'error_no_clasificado';
  return `error_${estado}`;
}

function registrar(evento: string, codigo: string, error: unknown): void {
  const nombre = error instanceof Error ? error.name : typeof error;
  console.error(JSON.stringify({ evento, codigo, nombre }));
}
