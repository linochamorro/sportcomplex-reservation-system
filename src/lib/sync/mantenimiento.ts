import { bd } from '../db/cliente';

export const DIAS_RETENCION_OPS = 30;
export const DIAS_RETENCION_TUMBAS = 90;

/**
 * Purga terminales antiguas preservando el UNIQUE(usuarioId, clienteOpId)
 * de las recientes (dedup >> backoff máximo). Pendientes nunca se purgan.
 */
export async function purgarOperacionesAntiguas(): Promise<number> {
  const corte = new Date(Date.now() - DIAS_RETENCION_OPS * 86_400_000);
  const r = await bd.operacionPendiente.deleteMany({
    where: {
      estado: { in: ['procesada', 'conflicto', 'fallida_terminal'] },
      actualizadoEn: { lt: corte },
    },
  });
  return r.count;
}

/** Ventana de resync: clientes más stale que esto deben hacer pull desde 0. */
export async function purgarRegistroAntiguo(): Promise<number> {
  const corte = new Date(Date.now() - DIAS_RETENCION_TUMBAS * 86_400_000);
  const r = await bd.registroCambio.deleteMany({ where: { cambiadoEn: { lt: corte } } });
  return r.count;
}

export type OpReclamada = {
  id: number;
  usuarioId: number;
  clienteOpId: string;
  tipo: string;
  carga: unknown;
};

/**
 * Reclamo para procesadores (B-02..): debe llamarse DENTRO de la transacción
 * del procesador para que SKIP LOCKED tenga efecto. Orden total (creadoEn, id).
 */
export async function tomarLote(
  tx: { $queryRaw: <T>(q: TemplateStringsArray, ...v: unknown[]) => Promise<T> },
  limite = 50,
  usuarioId: number | null = null,
  tipos: string[] = [],
): Promise<OpReclamada[]> {
  if (tipos.length === 0) return [];
  // Filtro de tipos EN el SQL, antes del LIMIT (OBS-1): evita que ops de tipos
  // no implementados acaparen el lote y provoquen hambruna de las implementadas.
  return tx.$queryRaw<OpReclamada[]>`
    SELECT id, "usuarioId", "clienteOpId", tipo, carga
    FROM "OperacionPendiente"
    WHERE estado = 'pendiente'
      AND (${usuarioId}::int IS NULL OR "usuarioId" = ${usuarioId}::int)
      AND tipo = ANY(${tipos}::text[])
    ORDER BY "creadoEn", id
    LIMIT ${limite}
    FOR UPDATE SKIP LOCKED`;
}
