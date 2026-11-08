/**
 * Decide qué hacer con el resultado de enviar una reserva.
 *
 * Tres salidas y solo tres: se aceptó, se muestra un error que el usuario tiene
 * que corregir, o se encola para reintentar. La distinction importante es la
 * última: reencolar tiene sentido cuando la falla no depende de los datos, o sea
 * sin red o con un 503 que el servidor marcó como reintentable. Un 4xx nunca se
 * reencola: reintentaría un turno inválido para siempre.
 *
 * Función pura a propósito, sin fetch ni IndexedDB, para que cada rama se pruebe
 * sin navegador.
 */

export type MotivoEncolado = 'sin-conexion' | 'servicio-no-disponible';

export type DecisionEnvio =
  | { accion: 'aceptada'; montoCentavos: number }
  | { accion: 'error'; mensaje: string }
  | { accion: 'encolar'; motivo: MotivoEncolado };

/** `red` es que el fetch lanzó: no hubo respuesta, no hay código que mirar. */
export type RespuestaEnvio =
  | { tipo: 'red' }
  | { tipo: 'respuesta'; estado: number; cuerpo: unknown };

const MENSAJE_POR_DEFECTO = 'No se pudo crear la solicitud';

function cuerpoDe(cuerpo: unknown): Record<string, unknown> {
  return typeof cuerpo === 'object' && cuerpo !== null ? (cuerpo as Record<string, unknown>) : {};
}

/** Solo se confía en `reintentable` si además el estado es 503 (invariante del servidor). */
function pideReintento(estado: number, cuerpo: unknown): boolean {
  return estado === 503 && cuerpoDe(cuerpo).reintentable === true;
}

export function decidirEnvio(respuesta: RespuestaEnvio): DecisionEnvio {
  if (respuesta.tipo === 'red') return { accion: 'encolar', motivo: 'sin-conexion' };
  const { estado, cuerpo } = respuesta;
  if (estado >= 200 && estado < 300) {
    const monto = cuerpoDe(cuerpo).montoTotalCentavos;
    return { accion: 'aceptada', montoCentavos: typeof monto === 'number' ? monto : 0 };
  }
  if (pideReintento(estado, cuerpo)) return { accion: 'encolar', motivo: 'servicio-no-disponible' };
  const mensaje = cuerpoDe(cuerpo).error;
  return { accion: 'error', mensaje: typeof mensaje === 'string' && mensaje !== '' ? mensaje : MENSAJE_POR_DEFECTO };
}

/** Mensaje para el usuario según el motivo; el estado visible ya existe en los tokens. */
export function mensajeEncolado(motivo: MotivoEncolado): string {
  return motivo === 'sin-conexion'
    ? 'Sin conexión: tu solicitud quedó en cola y se enviará al conectar.'
    : 'El servicio está ocupado: tu solicitud quedó en cola y se enviará en unos segundos.';
}
