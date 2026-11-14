import { obtenerBdLocal, estaOfflineDisponible, type OpLocal } from './bd-local';
import type { AckOp, CambioPull } from './tipos';
import type { PuertaSync } from './sincronizar';

// El cursor del pull vive en localStorage, no en la outbox: es un puntero de
// lectura, no una operación, y tiene que sobrevivir a que la outbox se vacíe.
const CLAVE_TOKEN = 'sportcomplex:sync:token';

function almacenamiento(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    // Modo privado o cookies bloqueadas: sin cursor, el pull rehace desde 0.
    return null;
  }
}

export async function leerToken(): Promise<string> {
  return almacenamiento()?.getItem(CLAVE_TOKEN) ?? '0';
}

export async function guardarToken(token: string): Promise<void> {
  almacenamiento()?.setItem(CLAVE_TOKEN, token);
}

/** `true` si hay sesión: sin ella el sincronizador no empuja nada. */
export async function haySesion(): Promise<boolean> {
  try {
    const r = await fetch('/api/auth/me', { cache: 'no-store' });
    return r.ok;
  } catch {
    return false;
  }
}

/** Empuja un lote y devuelve el ACK por operación. Lanza si la red se cae. */
export async function push(ops: OpLocal[]): Promise<AckOp[]> {
  const r = await fetch('/api/sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      ops: ops.map((o) => ({ clienteOpId: o.clienteOpId, tipo: o.tipo, carga: o.carga })),
    }),
  });
  if (!r.ok) {
    // Un 503 acá también es transitorio: se propaga como excepción y el motor
    // aborta sin marcar nada, así el reintento sigue siendo idempotente.
    throw new Error(`sync push ${r.status}`);
  }
  const cuerpo = (await r.json()) as { acks?: AckOp[] };
  return cuerpo.acks ?? [];
}

/** Trae cambios desde el cursor. Lanza si la red se cae. */
export async function pull(desde: string): Promise<{ cambios: CambioPull[]; token: string }> {
  const r = await fetch(`/api/sync?desde=${encodeURIComponent(desde)}`, { cache: 'no-store' });
  if (!r.ok) throw new Error(`sync pull ${r.status}`);
  const cuerpo = (await r.json()) as { cambios?: CambioPull[]; token?: string };
  return { cambios: cuerpo.cambios ?? [], token: cuerpo.token ?? desde };
}

/** Puerta de producción, sobre `fetch`. Sin sesión ni IndexedDB, no hace nada. */
export function puertaHttp(): PuertaSync {
  return { push, pull, leerToken, guardarToken, haySesion };
}

/** Operaciones esperando ser empujadas; 0 si no hay almacenamiento local. */
export async function pendientesEnCola(): Promise<number> {
  if (!estaOfflineDisponible()) return 0;
  const db = await obtenerBdLocal();
  if (!db) return 0;
  return db.outbox.where('estado').equals('pendiente').count();
}
