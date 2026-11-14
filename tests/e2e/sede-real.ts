import 'dotenv/config';
import { Client } from 'pg';
import { CORTE_RESERVA_MINUTOS, fechaEnLima, minutosPara } from '@/lib/ui/reloj-lima';

/**
 * Los flujos de navegador (a11y, flujo completo, offline) reservan en sedes
 * REALES porque /reservar solo ofrece sedes con esPrueba=false. La sede semilla
 * `E2E_<marca>` del global-setup es de prueba y nunca aparece en ese desplegable.
 * Lo que reservan estos usuarios `@e2e.local` lo borra `limpiarRestos`.
 */

export type SedeConCanchas = { sedeId: number; sedeNombre: string; canchaId: number; canchaNombre: string };

/** Primera sede real (no de prueba) con canchas disponibles. */
export async function primeraSedeRealConCanchas(): Promise<SedeConCanchas> {
  const cliente = new Client({ connectionString: process.env.DIRECT_URL });
  await cliente.connect();
  try {
    const r = await cliente.query(
      `SELECT se.id AS sede_id, se.nombre AS sede_nombre, c.id AS cancha_id, c.nombre AS cancha_nombre
       FROM "Sede" se
       JOIN "Cancha" c ON c."sedeId" = se.id
       WHERE se."esPrueba" = false AND se."eliminadoEn" IS NULL
         AND c."eliminadoEn" IS NULL AND c.estado = 'DISPONIBLE'
       ORDER BY se.id, c.nombre
       LIMIT 1`,
    );
    if (r.rows.length === 0) throw new Error('no hay sedes reales con canchas disponibles');
    const f = r.rows[0];
    return {
      sedeId: f.sede_id as number,
      sedeNombre: f.sede_nombre as string,
      canchaId: f.cancha_id as number,
      canchaNombre: f.cancha_nombre as string,
    };
  } finally {
    await cliente.end();
  }
}

/**
 * Primer turno libre (reservado o bloqueado) en una sede real, a partir de
 * mañana. Devuelve fecha y hora ya válidas para el formulario.
 */
export async function turnoLibreEnSedeReal(): Promise<SedeConCanchas & { fecha: string; hora: string }> {
  const sede = await primeraSedeRealConCanchas();
  const cliente = new Client({ connectionString: process.env.DIRECT_URL });
  await cliente.connect();
  try {
    const hoy = fechaEnLima();
    for (let dia = 1; dia <= 14; dia += 1) {
      const base = new Date(`${hoy}T00:00:00Z`);
      base.setUTCDate(base.getUTCDate() + dia);
      const fecha = base.toISOString().slice(0, 10);
      for (let h = 8; h <= 21; h += 1) {
        const hora = `${String(h).padStart(2, '0')}:00`;
        if (minutosPara(fecha, hora) < CORTE_RESERVA_MINUTOS + 1) continue;
        const ocupado = await cliente.query(
          `SELECT 1 FROM "Solicitud"
             WHERE "canchaId" = $1 AND fecha = $2 AND "horaInicio" = $3
               AND estado IN ('PENDIENTE','CONFIRMADA') AND "eliminadoEn" IS NULL
           UNION ALL
           SELECT 1 FROM "BloqueoCancha"
             WHERE "canchaId" = $1 AND fecha = $2 AND "horaInicio" = $3
               AND "eliminadoEn" IS NULL`,
          [sede.canchaId, fecha, hora],
        );
        if (ocupado.rows.length === 0) return { ...sede, fecha, hora };
      }
    }
  } finally {
    await cliente.end();
  }
  throw new Error(`sin turno libre en ${sede.sedeNombre}`);
}
