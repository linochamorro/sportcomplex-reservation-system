import { bd } from '../db/cliente';
import { registrarCambio } from '../sync/registro';
import { MOTIVO_LIBERADA_POR_VENCIMIENTO } from './turnos';

/** Transición PENDIENTE→LIBERADA de los holds vencidos (reloj servidor). */
export async function liberarVencidas(ahora: Date = new Date()): Promise<number> {
  return bd.$transaction(async (tx) => {
    const vencidas = await tx.solicitud.findMany({
      where: { estado: 'PENDIENTE', eliminadoEn: null, limiteHold: { lt: ahora } },
      select: { id: true, canchaId: true, usuarioId: true },
    });
    for (const s of vencidas) {
      await tx.solicitud.update({
        where: { id: s.id },
        data: { estado: 'LIBERADA', motivo: MOTIVO_LIBERADA_POR_VENCIMIENTO },
      });
      const cancha = await tx.cancha.findUnique({
        where: { id: s.canchaId },
        select: { sedeId: true },
      });
      await registrarCambio(tx, {
        tabla: 'Solicitud',
        filaId: s.id,
        sedeId: cancha?.sedeId ?? null,
        usuarioId: s.usuarioId,
      });
    }
    return vencidas.length;
  });
}

/**
 * Barrido oportunista: el cron de Vercel puede no estar disponible (plan Hobby
 * solo dispara una vez al día) o fallar. Antes de leer o crear reservas se
 * liberan los holds vencidos, de modo que el plazo de 3 h se cumpla siempre.
 * Es una consulta indexada que casi siempre devuelve 0 filas.
 */
export async function barrerVencidos(): Promise<number> {
  try {
    return await liberarVencidas();
  } catch {
    // Nunca debe tumbar una lectura por un fallo del barrido.
    return 0;
  }
}
