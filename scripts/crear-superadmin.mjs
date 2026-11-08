#!/usr/bin/env node
// Crea el primer SUPERADMIN (+ primera sede opcional). One-time, fuera del bundle HTTP.
// Uso: BOOTSTRAP_ADMIN_EMAIL=a@b.c BOOTSTRAP_ADMIN_CLAVE=... [BOOTSTRAP_SEDE="Norte"] node scripts/crear-superadmin.mjs
import 'dotenv/config';
import { createRequire } from 'node:module';
import pg from 'pg';

const require = createRequire(`${process.cwd()}/package.json`);
const bcryptjs = require('bcryptjs');

const email = (process.env.BOOTSTRAP_ADMIN_EMAIL ?? '').trim().toLowerCase();
const clave = process.env.BOOTSTRAP_ADMIN_CLAVE ?? '';
const sede = (process.env.BOOTSTRAP_SEDE ?? '').trim();

if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || clave.length < 8) {
  console.error('BOOTSTRAP_ADMIN_EMAIL/CLAVE inválidos (clave >= 8).');
  process.exit(1);
}

const cliente = new pg.Client({ connectionString: process.env.DIRECT_URL });
await cliente.connect();
try {
  const { rows } = await cliente.query(`select count(*)::int as n from public."Usuario" where rol = 'SUPERADMIN'`);
  if (rows[0].n > 0) {
    console.error('Ya existe un SUPERADMIN: el script se niega a crear otro.');
    process.exit(1);
  }
  let sedeId = null;
  if (sede) {
    const r = await cliente.query(
      `insert into public."Sede" (nombre, apertura, cierre, "actualizadoEn") values ($1, '08:00', '22:00', now())
       on conflict (nombre) do update set nombre = excluded.nombre, "actualizadoEn" = now() returning id`,
      [sede.slice(0, 120)],
    );
    sedeId = r.rows[0].id;
  }
  const hash = await bcryptjs.hash(clave, 12);
  // SUPERADMIN siempre sin sede (CHECK usuario_rol_sede_chk); la sede queda suelta para el primer ADMIN.
  await cliente.query(
    `insert into public."Usuario" (email, "passwordHash", nombre, rol, "sedeId", "actualizadoEn")
     values ($1, $2, $3, 'SUPERADMIN', NULL, now())`,
    [email, hash, email],
  );
  console.log(`SUPERADMIN creado${sedeId ? ` y sede inicial id=${sedeId}` : ''}. Rota o elimina las variables BOOTSTRAP_*.`);
} finally {
  await cliente.end();
}
