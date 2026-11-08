import { createHash } from 'node:crypto';
import { bd } from '../db/cliente';

const VENTANA_MS = 60_000;
const MAX_INTENTOS = 5;

type ResultadoIntento = { bloqueado: boolean };

export function claveThrottleIp(cabeceras: { get(nombre: string): string | null }): string | null {
  const ipVercel = cabeceras.get('x-real-ip')?.trim();
  const forwarded = cabeceras.get('x-forwarded-for')?.split(',')[0]?.trim();
  const ip = process.env.NODE_ENV === 'production' ? ipVercel : ipVercel || forwarded;
  if (!ip || ip.length > 64) return null;
  return `recuperar:reset:ip:${createHash('sha256').update(ip).digest('hex')}`;
}

export async function consumirIntento(identificador: string): Promise<boolean> {
  try {
    const filas = await bd.$queryRaw<ResultadoIntento[]>`
      INSERT INTO "IntentoLogin" ("identificador", "intentos", "ultimoIntento", "bloqueadoHasta")
      VALUES (${identificador}, 1, CURRENT_TIMESTAMP, NULL)
      ON CONFLICT ("identificador") DO UPDATE SET
        "intentos" = CASE
          WHEN "IntentoLogin"."ultimoIntento" <= CURRENT_TIMESTAMP - (${VENTANA_MS} * INTERVAL '1 millisecond') THEN 1
          ELSE "IntentoLogin"."intentos" + 1
        END,
        "bloqueadoHasta" = CASE
          WHEN "IntentoLogin"."ultimoIntento" > CURRENT_TIMESTAMP - (${VENTANA_MS} * INTERVAL '1 millisecond')
            AND "IntentoLogin"."intentos" + 1 >= ${MAX_INTENTOS}
            THEN CURRENT_TIMESTAMP + (${VENTANA_MS} * INTERVAL '1 millisecond')
          ELSE NULL
        END,
        "ultimoIntento" = CURRENT_TIMESTAMP
      RETURNING "bloqueadoHasta" > CURRENT_TIMESTAMP AS "bloqueado"
    `;
    return filas[0]?.bloqueado === true;
  } catch {
    return true;
  }
}

export async function limpiarIntentos(identificador: string): Promise<void> {
  try {
    await bd.intentoLogin.delete({ where: { identificador } });
  } catch {
    return;
  }
}
