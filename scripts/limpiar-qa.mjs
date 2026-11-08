#!/usr/bin/env node
// Borra SOLO los datos de QA: usuarios test-*, sede E2E_QA y todo lo ligado a ellos.
// Uso: node scripts/limpiar-qa.mjs
import 'dotenv/config';
import pg from 'pg';

const cliente = new pg.Client({ connectionString: process.env.DIRECT_URL });
await cliente.connect();
try {
  const usuarios = await cliente.query(
    `select id from public."Usuario" where email in ('test-super@gmail.com', 'test-admin@gmail.com', 'test-user@gmail.com')`,
  );
  const ids = usuarios.rows.map((u) => u.id);
  if (ids.length > 0) {
    await cliente.query(`delete from public."Comprobante" where "solicitudId" in (select id from public."Solicitud" where "usuarioId" = any($1))`, [ids]);
    await cliente.query(`delete from public."AccionReservaAfectada" where "solicitudId" in (select id from public."Solicitud" where "usuarioId" = any($1))`, [ids]);
    await cliente.query(`delete from public."Solicitud" where "usuarioId" = any($1)`, [ids]);
    await cliente.query(`delete from public."OperacionPendiente" where "usuarioId" = any($1)`, [ids]);
    await cliente.query(`delete from public."Notificacion" where "usuarioId" = any($1)`, [ids]);
    await cliente.query(`delete from public."PasswordResetToken" where "usuarioId" = any($1)`, [ids]);
    await cliente.query(`delete from public."RegistroCambio" where "usuarioId" = any($1)`, [ids]);
    await cliente.query(`delete from public."Usuario" where id = any($1)`, [ids]);
    console.log(`Usuarios QA eliminados: ${ids.length}.`);
  }
  const sedes = await cliente.query(`select id from public."Sede" where nombre = 'E2E_QA'`);
  for (const s of sedes.rows) {
    await cliente.query(
      `delete from public."AccionReservaAfectada" where "bloqueoId" in (select id from public."BloqueoCancha" where "canchaId" in (select id from public."Cancha" where "sedeId" = $1))`,
      [s.id],
    );
    await cliente.query(
      `delete from public."BloqueoCancha" where "canchaId" in (select id from public."Cancha" where "sedeId" = $1)`,
      [s.id],
    );
    await cliente.query(
      `delete from public."Comprobante" where "solicitudId" in (select id from public."Solicitud" where "canchaId" in (select id from public."Cancha" where "sedeId" = $1))`,
      [s.id],
    );
    await cliente.query(
      `delete from public."Solicitud" where "canchaId" in (select id from public."Cancha" where "sedeId" = $1)`,
      [s.id],
    );
    await cliente.query(`delete from public."Tarifa" where "sedeId" = $1`, [s.id]);
    await cliente.query(`delete from public."RegistroCambio" where "sedeId" = $1`, [s.id]);
    await cliente.query(`delete from public."Cancha" where "sedeId" = $1`, [s.id]);
    await cliente.query(`delete from public."Sede" where id = $1`, [s.id]);
    console.log(`Sede E2E_QA id=${s.id} eliminada con sus canchas, tarifas, solicitudes y auditoría.`);
  }
  const resto = await cliente.query(`select count(*)::int as n from public."Solicitud" where "eliminadoEn" is null`);
  console.log(`Solicitudes restantes en BD: ${resto.rows[0].n} (la siembra debe seguir intacta).`);
} finally {
  await cliente.end();
}
