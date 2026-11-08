#!/usr/bin/env node
// Estado real del pool, para decidir DB_POOL_MAX con datos en vez de a ojo.
// Uso: node scripts/diagnostico-pool.mjs
//lee el límite del servidor, los backends vivos y el tamaño configurado acá.
import 'dotenv/config';
import pg from 'pg';

const configurado = process.env.DB_POOL_MAX ?? '10 (default)';
const pool = new pg.Pool({ connectionString: process.env.DIRECT_URL, connectionTimeoutMillis: 8_000, max: 1 });

function linea(n) {
  console.log(n);
}

try {
  const opciones = await pool.query(
    `select current_setting('max_connections')::int      as maximo,
            current_setting('superuser_reserved_connections')::int as reservados,
            current_setting('server_version')            as version`,
  );
  const cfg = opciones.rows[0];
  linea(`Postgres ${cfg.version} · max_connections=${cfg.maximo} (${cfg.reservados} reservados a superusuario)`);

  const porEstado = await pool.query(
    `select coalesce(state, 'sin estado') as estado, count(*)::int as n
     from pg_stat_activity where datname = current_database()
     group by 1 order by 2 desc`,
  );
  linea('\nBackends por estado (conexión directa, incluye esta):');
  for (const r of porEstado.rows) linea(`  ${String(r.estado).padEnd(16)} ${r.n}`);

  const apps = await pool.query(
    `select coalesce(application_name, '(sin nombre)') as app, count(*)::int as n
     from pg_stat_activity where datname = current_database()
     group by 1 order by 2 desc limit 10`,
  );
  linea('\nPor application_name:');
  for (const r of apps.rows) linea(`  ${String(r.app).padEnd(24)} ${r.n}`);

  const maxEsperado = Number(process.env.DB_POOL_MAX ?? 10);
  const usados = porEstado.rows.reduce((a, r) => a + r.n, 0);
  const headroom = cfg.maximo - cfg.reservados - usados;
  linea(`\nDB_POOL_MAX configurado: ${configurado}`);
  linea(`Backends en uso ahora: ${usados} · headroom del servidor: ${headroom}`);
  linea(
    headroom < maxEsperado
      ? `\nAVISO: DB_POOL_MAX (${maxEsperado}) supera el headroom (${headroom}). Bajalo o subi el plan.`
      : `\nHay margen para ${headroom} conexiones más.`,
  );
  linea(
    '\nNota: DATABASE_URL apunta al pooler transaccional (6543), donde cada conexión\n' +
      'del pool se multiplexa sobre backends compartidos. El límite de clientes del\n' +
      'pooler no se ve desde aquí: se revisa en el panel de Supabase (Database → Pooler).',
  );
} catch (error) {
  console.error(`No se pudo consultar el estado del pool: ${error instanceof Error ? error.message : error}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
