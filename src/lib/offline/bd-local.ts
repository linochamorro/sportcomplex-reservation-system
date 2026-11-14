import type Dexie from 'dexie';
import type { Table } from 'dexie';
import type { AckOp, CambioPull, OpCliente } from './tipos';

export type OpLocal = OpCliente & {
  estado: 'pendiente' | 'enviada' | 'conflicto' | 'fallida';
  intentos: number;
  error?: string;
  creadoEn: number;
};

export type CacheLocal = {
  clave: string;
  tabla: string;
  filaId: number;
  datos: Record<string, unknown>;
  actualizadoEn: string;
};

export type BlobLocal = { clave: string; blob: Blob; tipo: string };

class BdOffline extends (Object as unknown as new () => Dexie) {
  outbox!: Table<OpLocal, string>;
  cache!: Table<CacheLocal, string>;
  blobs!: Table<BlobLocal, string>;
}

function errorCuota(error: unknown): Error {
  if (error instanceof Error) return error;
  return new Error('OFFLINE_SIN_ESPACIO: almacenamiento lleno, cola retenida');
}

function esCuotaLlena(error: unknown): boolean {
  return (
    typeof DOMException !== 'undefined' &&
    error instanceof DOMException &&
    (error.name === 'QuotaExceededError' || error.code === 22)
  );
}

function anteCuota(error: unknown): never {
  if (esCuotaLlena(error)) throw errorCuota(error);
  throw error;
}

let instancia: BdOffline | null = null;

/** Fail-closed: sin IndexedDB no hay writes offline. Solo cliente, import dinámico. */
export function estaOfflineDisponible(): boolean {
  return typeof indexedDB !== 'undefined';
}

export async function obtenerBdLocal(): Promise<BdOffline | null> {
  if (!estaOfflineDisponible()) return null;
  if (instancia) return instancia;
  const { default: DexieClase } = await import('dexie');
  const db = new DexieClase('sportcomplex-offline') as BdOffline & {
    version(n: number): { stores(e: Record<string, string>): unknown };
  };
  db.version(1).stores({
    outbox: 'clienteOpId, estado, creadoEn',
    cache: 'clave, tabla, filaId',
    blobs: 'clave',
  });
  instancia = db as BdOffline;
  return instancia;
}

/** Aislamiento por logout: expulsa todo rastro del dispositivo. */
export async function evacuarDispositivo(): Promise<void> {
  const db = await obtenerBdLocal();
  if (!db) return;
  await db.outbox.clear();
  await db.cache.clear();
  await db.blobs.clear();
}

export async function encolarOp(op: OpCliente): Promise<void> {
  const db = await obtenerBdLocal();
  if (!db) throw new Error('Almacenamiento offline no disponible');
  try {
    await db.outbox.put({
      ...op,
      estado: 'pendiente',
      intentos: 0,
      creadoEn: Date.now(),
    });
  } catch (error) {
    anteCuota(error);
  }
}

/** Aplica cambios del pull a la caché: upsert o expulsión ante tumba. */
export async function aplicarCambios(cambios: CambioPull[]): Promise<void> {
  const db = await obtenerBdLocal();
  if (!db) throw new Error('Almacenamiento offline no disponible');
  for (const c of cambios) {
    const clave = `${c.tabla}:${c.filaId}`;
    try {
      if (c.eliminado || !c.fila) {
        await db.cache.delete(clave);
      } else {
        await db.cache.put({
          clave,
          tabla: c.tabla,
          filaId: c.filaId,
          datos: c.fila,
          actualizadoEn: new Date().toISOString(),
        });
      }
    } catch (error) {
      anteCuota(error);
    }
  }
}

export async function marcarAcks(acks: AckOp[]): Promise<void> {
  const db = await obtenerBdLocal();
  if (!db) return;
  for (const ack of acks) {
    try {
      if (ack.estado === 'aceptada') {
        await db.outbox.delete(ack.clienteOpId);
      } else {
        await db.outbox.update(ack.clienteOpId, {
          estado: ack.estado === 'conflicto' ? 'conflicto' : 'fallida',
          error: ack.motivo,
        });
      }
    } catch (error) {
      anteCuota(error);
    }
  }
}
