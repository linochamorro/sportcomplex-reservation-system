import {
  aplicarCambios,
  encolarOp,
  estaOfflineDisponible,
  marcarAcks,
  obtenerBdLocal,
  type OpLocal,
} from './bd-local';
import { BACKOFF_MAX_MS, msBackoff, type AckOp, type CambioPull } from './tipos';

// DLQ local: tras N reintentos la op queda 'fallida' terminal y visible (no reintenta).
export const MAX_REINTENTOS_LOCAL = 10;

export type ResultadoSync = {
  empujadas: number;
  conflictos: number;
  fallidas: number;
  traidas: number;
  token: string;
  abortada?: boolean;
};

export type PuertaSync = {
  push: (ops: OpLocal[]) => Promise<AckOp[]>;
  pull: (desde: string) => Promise<{ cambios: CambioPull[]; token: string }>;
  leerToken: () => Promise<string>;
  guardarToken: (token: string) => Promise<void>;
  haySesion: () => Promise<boolean>;
};

/**
 * Motor de sincronización (contrato v1): push por-op atómico en orden
 * (creadoEn, clienteOpId), backoff con topes, pull con cursor opaco.
 * Sin sesión no corre. Sesión expirada a mitad → aborta y reanuda luego.
 */
export async function sincronizar(puerta: PuertaSync): Promise<ResultadoSync> {
  if (!estaOfflineDisponible()) throw new Error('Offline no disponible');
  if (!(await puerta.haySesion())) return { empujadas: 0, conflictos: 0, fallidas: 0, traidas: 0, token: await puerta.leerToken(), abortada: true };
  const db = await obtenerBdLocal();
  if (!db) throw new Error('Offline no disponible');

  const salida: ResultadoSync = { empujadas: 0, conflictos: 0, fallidas: 0, traidas: 0, token: await puerta.leerToken() };
  const pendientes = await db.outbox
    .where('estado')
    .equals('pendiente')
    .sortBy('creadoEn');
  // Orden de cola cliente (creadoEn, clienteOpId). Distinto del orden de
  // consumo servidor (creadoEn, id): colas distintas, ambas totales.
  pendientes.sort((a, b) => (a.creadoEn - b.creadoEn) || (a.clienteOpId < b.clienteOpId ? -1 : 1));

  if (pendientes.length > 0) {
    let acks: AckOp[];
    try {
      acks = await puerta.push(pendientes);
    } catch {
      // Kill tras POST / red caída: no se marca nada; el reintento es idempotente.
      return { ...salida, abortada: true };
    }
    await marcarAcks(acks);
    for (const ack of acks) {
      if (ack.estado === 'aceptada') salida.empujadas += 1;
      else if (ack.estado === 'conflicto') salida.conflictos += 1;
      else salida.fallidas += 1;
    }
    // Reprograma fallidas con backoff (tope 24 h); conflicto queda terminal
    // y visible (prohibido cliente-gana en reintentos); tras MAX_REINTENTOS
    // la fallida queda terminal (DLQ local).
    for (const op of pendientes) {
      const ack = acks.find((a) => a.clienteOpId === op.clienteOpId);
      if (!ack || ack.estado === 'aceptada' || ack.estado === 'conflicto') continue;
      if (op.intentos + 1 >= MAX_REINTENTOS_LOCAL) {
        await db.outbox.update(op.clienteOpId, { estado: 'fallida', error: ack.motivo });
        continue;
      }
      const espera = Math.min(msBackoff(op.intentos), BACKOFF_MAX_MS);
      await db.outbox.update(op.clienteOpId, {
        intentos: op.intentos + 1,
        estado: 'pendiente',
        error: `reintento en ${espera}ms: ${ack.motivo ?? ''}`.trim(),
      });
    }
  }

  if (!(await puerta.haySesion())) return { ...salida, abortada: true };
  const { cambios, token } = await puerta.pull(salida.token);
  await aplicarCambios(cambios);
  await puerta.guardarToken(token);
  salida.traidas = cambios.length;
  salida.token = token;
  return salida;
}

export { encolarOp };
