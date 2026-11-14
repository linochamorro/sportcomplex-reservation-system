import { obtenerBdLocal } from './bd-local';
import type { CambioPull } from './tipos';

export type AvisoLocal = {
  clave: string;
  titulo: string;
  cuerpo: string;
  debidaEn: string;
};

const CLAVE_REVISION = 'meta:ultima-revision';

/**
 * Worker local de recordatorios (B-05/AC-03). Calcula avisos debidos desde la
 * caché + reloj persistente; al despertar (o tras pull) reconcilia: el servidor
 * gana y lo ya notificado no se repite. Sin IndexedDB no programa nada.
 */
export async function avisosDebidos(ahora: Date = new Date()): Promise<AvisoLocal[]> {
  const db = await obtenerBdLocal();
  if (!db) return [];
  const todas = await db.cache.toArray();
  const avisos: AvisoLocal[] = [];
  for (const c of todas) {
    if (c.tabla !== 'Solicitud') continue;
    const datos = c.datos as { horaInicio?: unknown; fecha?: unknown; estado?: unknown; id?: unknown };
    if (datos.estado !== 'PENDIENTE' && datos.estado !== 'CONFIRMADA') continue;
    if (typeof datos.horaInicio !== 'string' || typeof datos.fecha !== 'string') continue;
    const inicio = new Date(`${datos.fecha}T${datos.horaInicio}:00-05:00`).getTime();
    if (Number.isNaN(inicio)) continue;
    const resta = inicio - ahora.getTime();
    if (resta > 0 && resta <= 20 * 60_000) {
      avisos.push({
        clave: `local:${c.filaId}:${resta <= 10 * 60_000 ? '10' : '20'}`,
        titulo: resta <= 10 * 60_000 ? 'Tu reserva empieza en 10 minutos' : 'Tu reserva empieza en 20 minutos',
        cuerpo: `${datos.fecha} ${datos.horaInicio}`,
        debidaEn: new Date(inicio).toISOString(),
      });
    }
  }
  await db.cache.put({
    clave: CLAVE_REVISION,
    tabla: '_meta',
    filaId: 0,
    datos: {},
    actualizadoEn: ahora.toISOString(),
  });
  return avisos;
}

/** Reconciliación al despertar: aplica el pull y recalcula (servidor gana). */
export async function reconciliarAlDespertar(
  aplicar: (cambios: CambioPull[]) => Promise<void>,
  cambios: CambioPull[],
  ahora: Date = new Date(),
): Promise<AvisoLocal[]> {
  await aplicar(cambios);
  return avisosDebidos(ahora);
}
