import { bd } from '../db/cliente';
import type { Prisma } from '../db/generated/client';
import type { Sesion } from '../auth/sesion';
import type { AckOp } from '../offline/tipos';
import { clasificarError } from '../http/clasificar-error';
import { tomarLote } from './mantenimiento';
import { PROCESADORES, TIPOS_IMPLEMENTADOS, type ResultadoProceso } from './procesadores';

const TIMEOUT_LOTE_MS = 20_000;

/**
 * Consume la cola del usuario con `FOR UPDATE SKIP LOCKED` (invariante 8),
 * dentro de una transacción. El filtro de tipos va EN el SQL (OBS-1) y cada
 * op se procesa en un savepoint (OBS-2): una op venenosa queda `fallida_terminal`
 * sin abortar el lote. Timeout explícito (F-08).
 *
 * Excepción: si el fallo es transitorio (la base no respondió), la op NO se
 * marca terminal. Queda `pendiente` y el ACK lo marca reintentable, porque un
 * corte de cinco segundos no puede convertir la reserva de un usuario en un
 * fallo permanente.
 */
export async function procesarPendientes(sesion: Sesion): Promise<AckOp[]> {
  return bd.$transaction(
    async (tx) => {
      const lote = await tomarLote(tx, 50, sesion.id, TIPOS_IMPLEMENTADOS);
      const acks: AckOp[] = [];
      for (const op of lote) {
        const carga = (op.carga ?? {}) as Record<string, unknown>;
        let resultado: ResultadoProceso;
        try {
          // Savepoint por op: el rollback del savepoint no aborta el lote.
          resultado = await tx.$transaction(async (anidada) => {
            const procesador = PROCESADORES[op.tipo];
            if (!procesador) throw new Error(`tipo no implementado: ${op.tipo}`);
            return procesador(anidada, sesion, carga);
          });
        } catch (error) {
          if (clasificarError(error).reintentable) {
            // Se suelta sin tocar la fila: sigue `pendiente` y se reintenta.
            acks.push({
              clienteOpId: op.clienteOpId,
              estado: 'rechazada',
              motivo: 'servicio no disponible; se reintentará',
              reintentable: true,
            });
            continue;
          }
          resultado = {
            estado: 'rechazada',
            motivo: error instanceof Error ? error.message : 'Error inesperado',
          };
        }
        const estado =
          resultado.estado === 'aceptada'
            ? 'procesada'
            : resultado.estado === 'conflicto'
              ? 'conflicto'
              : 'fallida_terminal';
        await tx.operacionPendiente.update({
          where: { id: op.id },
          data: {
            estado,
            ultimoError: resultado.estado === 'aceptada' ? null : resultado.motivo,
            resultado: resultado as unknown as Prisma.InputJsonValue,
            // Purga de bytes (F-04/BLQ-2): la carga de comprobantes no se
            // conserva tras procesar; solo queda la metadata del resultado.
            ...(typeof carga.bytesBase64 === 'string' ? { carga: {} } : {}),
          },
        });
        acks.push(
          resultado.estado === 'aceptada'
            ? {
                clienteOpId: op.clienteOpId,
                estado: 'aceptada',
                serverId: resultado.solicitudId ?? resultado.bloqueoId,
              }
            : { clienteOpId: op.clienteOpId, estado: resultado.estado, motivo: resultado.motivo },
        );
      }
      return acks;
    },
    { timeout: TIMEOUT_LOTE_MS, maxWait: 5000 },
  );
}
