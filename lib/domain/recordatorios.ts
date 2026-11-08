import type { Prisma } from '../db/generated/client';
import { registrarCambio } from '../sync/registro';
import { inicioEnLimaAUtc } from './turnos';

// Recordatorios 20/10 min (B-05). Reloj servidor; idempotente por
// (solicitudId, tipo): una segunda pasada no duplica.

export const TIPOS_RECORDATORIO = ['recordatorio_20', 'recordatorio_10'] as const;
export type TipoRecordatorio = (typeof TIPOS_RECORDATORIO)[number];

const MIN_20 = 20 * 60_000;
const MIN_10 = 10 * 60_000;

/** Ventanas debidas para un inicio dado: [] | [20] | [10]. */
export function ventanasPara(inicioUtc: Date, ahora: Date): TipoRecordatorio[] {
  const resta = inicioUtc.getTime() - ahora.getTime();
  if (resta <= 0 || resta > MIN_20) return [];
  if (resta > MIN_10) return ['recordatorio_20'];
  return ['recordatorio_10'];
}

export type ClienteTx = Prisma.TransactionClient;

function tituloDe(tipo: TipoRecordatorio): string {
  return tipo === 'recordatorio_20' ? 'Tu reserva empieza en 20 minutos' : 'Tu reserva empieza en 10 minutos';
}

/**
 * Revisa PENDIENTE/CONFIRMADA no eliminadas y crea los recordatorios debidos.
 * Idempotente: no repite (solicitudId, tipo).
 */
export async function revisarRecordatorios(
  tx: ClienteTx,
  ahora: Date = new Date(),
): Promise<number> {
  const candidatas = await tx.solicitud.findMany({
    where: { estado: { in: ['PENDIENTE', 'CONFIRMADA'] }, eliminadoEn: null },
    select: { id: true, usuarioId: true, fecha: true, horaInicio: true, canchaId: true },
  });
  let creadas = 0;
  for (const s of candidatas) {
    let inicio: Date;
    try {
      inicio = inicioEnLimaAUtc(s.fecha, s.horaInicio);
    } catch {
      continue;
    }
    for (const tipo of ventanasPara(inicio, ahora)) {
      const existe = await tx.notificacion.findFirst({
        where: { solicitudId: s.id, tipo, eliminadoEn: null },
        select: { id: true },
      });
      if (existe) continue;
      const cancha = await tx.cancha.findUnique({ where: { id: s.canchaId }, select: { sedeId: true, nombre: true } });
      const creada = await tx.notificacion.create({
        data: {
          usuarioId: s.usuarioId,
          solicitudId: s.id,
          tipo,
          titulo: tituloDe(tipo),
          cuerpo: `Cancha ${cancha?.nombre ?? ''} · ${s.fecha} ${s.horaInicio}`,
        },
      });
      await registrarCambio(tx, {
        tabla: 'Notificacion',
        filaId: creada.id,
        sedeId: cancha?.sedeId ?? null,
        usuarioId: s.usuarioId,
      });
      creadas += 1;
    }
  }
  return creadas;
}
