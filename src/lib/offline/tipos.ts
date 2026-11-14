import { createHash } from 'node:crypto';

// Contrato de protocolo v1 (B-01). Vinculante para B-02...
// Semántica de error: HTTP 400 = lote/cursor inválido; rechazo por-op =
// ACK 'rechazada' con motivo dentro de HTTP 200 (lote parcial).

export const TIPOS_OP_CONOCIDOS = [
  'solicitud.crear',
  'solicitud.confirmar',
  'solicitud.rechazar',
  'solicitud.no-show',
  'bloqueo.crear',
  'bloqueo.reasignar',
  'bloqueo.reembolsar',
  'comprobante.subir',
  'notificacion.leer',
] as const;

export type TipoOp = (typeof TIPOS_OP_CONOCIDOS)[number];

/** Tope de cuerpo del push (H-03): acota el lote antes de parsear. */
export const MAX_CUERPO_SYNC_BYTES = 8 * 1024 * 1024;

export const UUID_V4 =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const MAX_OPS_LOTE = 100;
export const MAX_CAMBIOS_PULL = 200;

// Backoff: base 2 s ×2 con jitter, tope 5 min, máximo 24 h (contrato v1).
export const BACKOFF_BASE_MS = 2000;
export const BACKOFF_TOPE_MS = 300_000;
export const BACKOFF_MAX_MS = 86_400_000;

export function msBackoff(intentos: number, azar: number = Math.random()): number {
  const exp = Math.min(BACKOFF_BASE_MS * Math.pow(2, Math.max(0, intentos)), BACKOFF_TOPE_MS);
  return Math.min(Math.floor(exp * (0.5 + azar * 0.5)), BACKOFF_MAX_MS);
}

export function cadenaEstable(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') return JSON.stringify(valor) ?? '';
  if (Array.isArray(valor)) return `[${valor.map(cadenaEstable).join(',')}]`;
  const claves = Object.keys(valor as Record<string, unknown>).sort();
  return `{${claves.map((k) => `${JSON.stringify(k)}:${cadenaEstable((valor as Record<string, unknown>)[k])}`).join(',')}}`;
}

export function hashCarga(carga: unknown): string {
  return createHash('sha256').update(cadenaEstable(carga), 'utf8').digest('hex');
}

export type OpCliente = { clienteOpId: string; tipo: string; carga: Record<string, unknown> };

export type AckOp = {
  clienteOpId: string;
  estado: 'aceptada' | 'rechazada' | 'conflicto';
  serverId?: number;
  motivo?: string;
  /**
   * El rechazo no es definitivo: la base no respondió o la operación quedó
   * esperando. El cliente la reintenta con backoff sin quemarla en su DLQ local,
   * porque el mismo reintento puede volver a funcionar sin cambios.
   */
  reintentable?: boolean;
};

export type CambioPull = {
  seq: string;
  tabla: string;
  filaId: number;
  sedeId: number | null;
  usuarioId: number | null;
  eliminado: boolean;
  fila: Record<string, unknown> | null;
};
