import 'dotenv/config';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import bcrypt from 'bcryptjs';
import { Client } from 'pg';

/**
 * Siembra de e2e. Autorreparable: antes de crear nada borra los restos de
 * corridas anteriores, porque una corrida interrumpida dejaba sedes `E2E_*`
 * visibles en el catálogo público de /reservar.
 */
export default async function setup() {
  const cliente = new Client({ connectionString: process.env.DIRECT_URL });
  await cliente.connect();
  try {
    await limpiarRestos(cliente);

    const marca = Date.now();
    // `esPrueba` mantiene la sede fuera del catálogo público de /reservar.
    const sede = await cliente.query(
      `INSERT INTO "Sede" (nombre, apertura, cierre, "esPrueba", "actualizadoEn")
       VALUES ($1, '00:00', '23:59', true, now()) RETURNING id`,
      [`E2E_${marca}`],
    );
    const sedeId = sede.rows[0].id as number;
    await cliente.query(
      `INSERT INTO "Cancha" ("sedeId", nombre, "tarifaBaseCentavos", estado, "motivoNoDisponible", "actualizadoEn")
       VALUES ($1, 'E2E 1', 5000, 'DISPONIBLE', NULL, now())
       ON CONFLICT ("sedeId", nombre) DO UPDATE SET "tarifaBaseCentavos" = 5000, "actualizadoEn" = now()`,
      [sedeId],
    );
    // Claves aleatorias por corrida (no fijas): se guardan solo en el JSON
    // temporal de la corrida para que los specs las lean.
    const claveA11yAdmin = randomBytes(24).toString('hex');
    const claveSuperadmin = randomBytes(24).toString('hex');
    await cliente.query(
      `INSERT INTO "Usuario" (email, "passwordHash", nombre, rol, "sedeId", "actualizadoEn")
       VALUES ('a11y_admin@e2e.local', $1, 'A11y', 'ADMIN', $2, now())
       ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", "sedeId" = EXCLUDED."sedeId",
         rol = 'ADMIN', "eliminadoEn" = NULL, "actualizadoEn" = now()`,
      [await bcrypt.hash(claveA11yAdmin, 10), sedeId],
    );
    await cliente.query(
      `INSERT INTO "Usuario" (email, "passwordHash", nombre, rol, "sedeId", "actualizadoEn")
       VALUES ('e2e_superadmin@e2e.local', $1, 'E2E Superadmin', 'SUPERADMIN', NULL, now())
       ON CONFLICT (email) DO UPDATE SET "passwordHash" = EXCLUDED."passwordHash", rol = 'SUPERADMIN',
         "sedeId" = NULL, "eliminadoEn" = NULL, "actualizadoEn" = now()`,
      [await bcrypt.hash(claveSuperadmin, 10)],
    );
    writeFileSync(
      join(process.cwd(), 'e2e', '.semilla-e2e.json'),
      JSON.stringify({ sedeId, marca, claveA11yAdmin, claveSuperadmin }),
    );
  } finally {
    await cliente.end();
  }
}

/**
 * Borra los restos de corridas e2e previas: usuarios `@e2e.local` y sedes
 * `E2E_<marca>`. Se ejecuta en el setup (autorreparable) para que una corrida
 * abortada nunca deje sedes de prueba visibles en el catálogo de /reservar.
 */
export async function limpiarRestos(cliente: Client): Promise<number> {
  // Primero los usuarios: referencian la sede (FK).
  const correosE2e = (await cliente.query(`SELECT id FROM "Usuario" WHERE email LIKE '%@e2e.local'`)).rows.map(
    (u) => u.id as number,
  );
  for (const ids of [correosE2e]) {
    if (ids.length === 0) continue;
    // Los flujos de navegador reservan en sedes reales, así que sus solicitudes
    // también son basura de la corrida. Sin esto, `Usuario` no se podría borrar
    // (FK Restrict) y la corrida siguiente heredaría el turno ocupado.
    await cliente.query(
      `DELETE FROM "AccionReservaAfectada" WHERE "solicitudId" IN (SELECT id FROM "Solicitud" WHERE "usuarioId" = ANY($1))`,
      [ids],
    );
    await cliente.query(
      `DELETE FROM "Comprobante" WHERE "solicitudId" IN (SELECT id FROM "Solicitud" WHERE "usuarioId" = ANY($1))`,
      [ids],
    );
    await cliente.query(`DELETE FROM "Solicitud" WHERE "usuarioId" = ANY($1)`, [ids]);
    await cliente.query(`DELETE FROM "Notificacion" WHERE "usuarioId" = ANY($1)`, [ids]);
    await cliente.query(`DELETE FROM "PasswordResetToken" WHERE "usuarioId" = ANY($1)`, [ids]);
    await cliente.query(`DELETE FROM "OperacionPendiente" WHERE "usuarioId" = ANY($1)`, [ids]);
    await cliente.query(`DELETE FROM "RegistroCambio" WHERE "usuarioId" = ANY($1)`, [ids]);
    await cliente.query(`DELETE FROM "Usuario" WHERE id = ANY($1)`, [ids]);
  }

  // Solo las sedes siembras por Playwright (`E2E_<marca>`) y las de prueba
  // desactivadas de corridas anteriores; `E2E_QA` de los usuarios de prueba se
  // gestiona con scripts/limpiar-qa.mjs.
  const sedes = await cliente.query(
    `SELECT id FROM "Sede"
     WHERE nombre ~ '^E2E_[0-9]+$'
        OR ("esPrueba" = true AND nombre LIKE '%<script>%')`,
  );
  for (const s of sedes.rows) {
    const id = s.id as number;
    const usuarios = await cliente.query(`SELECT id FROM "Usuario" WHERE "sedeId" = $1`, [id]);
    if (usuarios.rows.length > 0) {
      console.warn(`e2e setup: se omite la sede ${id}; tiene ${usuarios.rows.length} usuario(s) asociado(s).`);
      continue;
    }
    await cliente.query(
      `DELETE FROM "AccionReservaAfectada" WHERE "solicitudId" IN (SELECT id FROM "Solicitud" WHERE "canchaId" IN (SELECT id FROM "Cancha" WHERE "sedeId" = $1))`,
      [id],
    );
    await cliente.query(
      `DELETE FROM "AccionReservaAfectada" WHERE "bloqueoId" IN (SELECT id FROM "BloqueoCancha" WHERE "canchaId" IN (SELECT id FROM "Cancha" WHERE "sedeId" = $1))`,
      [id],
    );
    await cliente.query(
      `DELETE FROM "Comprobante" WHERE "solicitudId" IN (SELECT id FROM "Solicitud" WHERE "canchaId" IN (SELECT id FROM "Cancha" WHERE "sedeId" = $1))`,
      [id],
    );
    await cliente.query(
      `DELETE FROM "Solicitud" WHERE "canchaId" IN (SELECT id FROM "Cancha" WHERE "sedeId" = $1)`,
      [id],
    );
    await cliente.query(`DELETE FROM "BloqueoCancha" WHERE "canchaId" IN (SELECT id FROM "Cancha" WHERE "sedeId" = $1)`, [id]);
    await cliente.query(`DELETE FROM "Tarifa" WHERE "sedeId" = $1`, [id]);
    await cliente.query(`DELETE FROM "RegistroCambio" WHERE "sedeId" = $1`, [id]);
    await cliente.query(`DELETE FROM "Cancha" WHERE "sedeId" = $1`, [id]);
    await cliente.query(`DELETE FROM "Sede" WHERE id = $1`, [id]);
  }
  // "RegistroCambio" no tiene FK sobre sedeId: los specs que crean y borran sedes
  // de prueba con la API dejan auditoría apuntando a una sede que ya no existe.
  const huerfanas = await cliente.query(
    `UPDATE "RegistroCambio" SET "sedeId" = NULL
     WHERE "sedeId" IS NOT NULL AND "sedeId" NOT IN (SELECT id FROM "Sede")`,
  );
  if ((huerfanas.rowCount ?? 0) > 0) {
    console.log(`e2e teardown: ${huerfanas.rowCount} fila(s) de auditoría con sedeId = null.`);
  }
  return sedes.rows.length;
}
