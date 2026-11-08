import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';
import { PrismaClient } from './generated/client';

const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

function entero(nombre: string, porDefecto: number): number {
  const crudo = process.env[nombre];
  if (crudo === undefined || crudo === '') return porDefecto;
  const valor = Number(crudo);
  return Number.isFinite(valor) && valor > 0 ? Math.floor(valor) : porDefecto;
}

/**
 * Observabilidad del pool. Solo escribe cuando hay algo que ver: contention
 * (alguien esperaba una conexión) o un fallo de conexión. Si el log está
 * callado, el pool está bien; si aparece `pool_espera`, `DB_POOL_MAX` ya no
 * alcanza y hay que subirlo con este dato a la vista.
 *
 * `DB_POOL_MAX` se deja en 10 hasta que esto lo pida: `DATABASE_URL` apunta al
 * pooler transaccional de Supabase (6543), donde una conexión del pool no es un
 * backend de Postgres, así que subirlo es barato pero sigue siendo una decisión
 * que se toma con datos y no antes.
 */
function observarPool(pool: pg.Pool): void {
  pool.on('acquire', () => {
    if (pool.waitingCount > 0) {
      console.error(
        JSON.stringify({
          evento: 'pool_espera',
          total: pool.totalCount,
          libres: pool.idleCount,
          esperando: pool.waitingCount,
          maximo: pool.options.max,
        }),
      );
    }
  });
  pool.on('error', (error: Error) => {
    console.error(
      JSON.stringify({ evento: 'pool_error', nombre: error.name, total: pool.totalCount, maximo: pool.options.max }),
    );
  });
}

/**
 * Pool explícito. Con los defaults de `pg` (max 10, sin timeouts) el pooler
 * cortaba conexiones ociosas y Prisma acababa usando un socket ya cerrado, lo que
 * se manifestaba como errores esporádicos y opacos. Acá:
 *
 * - `idleTimeoutMillis` recicla antes de que el pooler corte, en vez de dejar que
 *   el pool devuelva conexiones muertas.
 * - `connectionTimeoutMillis` hace fallar rápido y de forma tipada en lugar de
 *   dejar la petición colgada hasta que el usuario se vaya.
 */
function crearPool(): pg.Pool {
  const pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL,
    max: entero('DB_POOL_MAX', 10),
    idleTimeoutMillis: entero('DB_POOL_IDLE_MS', 30_000),
    connectionTimeoutMillis: entero('DB_POOL_CONEXION_MS', 8_000),
    keepAlive: true,
    allowExitOnIdle: true,
  });
  observarPool(pool);
  return pool;
}

function crearCliente(): PrismaClient {
  const adapter = new PrismaPg(crearPool());
  return new PrismaClient({ adapter });
}

export const bd = globalParaPrisma.prisma ?? crearCliente();

if (process.env.NODE_ENV !== 'production') {
  globalParaPrisma.prisma = bd;
}
