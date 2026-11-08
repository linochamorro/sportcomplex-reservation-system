#!/usr/bin/env node
// Crea usuarios fijos de QA + sede de prueba E2E_QA. Idempotente, fuera del bundle HTTP.
// Uso: node scripts/crear-usuarios-prueba.mjs
// Limpieza: node scripts/limpiar-qa.mjs
import 'dotenv/config';
import { createRequire } from 'node:module';
import pg from 'pg';

const require = createRequire(`${process.cwd()}/package.json`);
const bcryptjs = require('bcryptjs');

const CLAVE_PRUEBA_QA = process.env.CLAVE_PRUEBA_QA;
if (!CLAVE_PRUEBA_QA || CLAVE_PRUEBA_QA.length < 10) {
  console.error('Error: define CLAVE_PRUEBA_QA con al menos 10 caracteres (clave de prueba QA, no fijada en código).');
  process.exit(1);
}

const USUARIOS = [
  { email: 'test-super@gmail.com', clave: CLAVE_PRUEBA_QA, nombre: 'QA Superadmin', rol: 'SUPERADMIN', sede: false },
  { email: 'test-admin@gmail.com', clave: CLAVE_PRUEBA_QA, nombre: 'QA Admin', rol: 'ADMIN', sede: true },
  { email: 'test-user@gmail.com', clave: CLAVE_PRUEBA_QA, nombre: 'QA Usuario', rol: 'USUARIO', sede: false },
];

const cliente = new pg.Client({ connectionString: process.env.DIRECT_URL });
await cliente.connect();
try {
  const sede = await cliente.query(
    `insert into public."Sede" (nombre, direccion, apertura, cierre, "esPrueba", "actualizadoEn")
     values ('E2E_QA', 'Av. Pruebas 123', '08:00', '22:00', true, now())
     on conflict (nombre) do update set direccion = excluded.direccion, apertura = excluded.apertura,
       cierre = excluded.cierre, "esPrueba" = true, "eliminadoEn" = NULL, "actualizadoEn" = now()
     returning id`,
  );
  const sedeId = sede.rows[0].id;
  for (const nombre of ['QA-C01', 'QA-C02']) {
    await cliente.query(
      `insert into public."Cancha" ("sedeId", nombre, "tarifaBaseCentavos", estado, "motivoNoDisponible", "actualizadoEn")
       values ($1, $2, 5000, 'DISPONIBLE', NULL, now())
       on conflict do nothing`,
      [sedeId, nombre],
    );
  }
  const tarifas = [
    ['QA-Tarifa Día', '{1,2,3,4,5,6,0}', '08:00', '18:00', 5000],
    ['QA-Tarifa Noche', '{1,2,3,4,5,6,0}', '18:00', '22:00', 7000],
  ];
  for (const [nombre, dias, inicio, fin, monto] of tarifas) {
    const existe = await cliente.query(
      `select id from public."Tarifa" where "sedeId" = $1 and nombre = $2 and "eliminadoEn" is null`,
      [sedeId, nombre],
    );
    if (existe.rows.length === 0) {
      await cliente.query(
        `insert into public."Tarifa" ("sedeId", nombre, "diasSemana", "horaInicio", "horaFin", "montoCentavos", "actualizadoEn")
         values ($1, $2, $3::smallint[], $4, $5, $6, now())`,
        [sedeId, nombre, dias, inicio, fin, monto],
      );
    }
  }
  for (const u of USUARIOS) {
    const existe = await cliente.query(`select id, rol from public."Usuario" where email = $1`, [u.email]);
    if (existe.rows.length > 0) {
      await cliente.query(
        `update public."Usuario" set nombre = $2, rol = $3, "sedeId" = $4, "eliminadoEn" = NULL, "actualizadoEn" = now() where email = $1`,
        [u.email, u.nombre, u.rol, u.sede ? sedeId : null],
      );
      console.log(`Actualizado ${u.email} (${u.rol}).`);
    } else {
      const hash = await bcryptjs.hash(u.clave, 10);
      await cliente.query(
        `insert into public."Usuario" (email, "passwordHash", nombre, rol, "sedeId", "actualizadoEn")
         values ($1, $2, $3, $4, $5, now())`,
        [u.email, hash, u.nombre, u.rol, u.sede ? sedeId : null],
      );
      console.log(`Creado ${u.email} (${u.rol}).`);
    }
  }
  console.log(`Sede E2E_QA id=${sedeId} con 2 canchas y 2 tarifas lista.`);
} finally {
  await cliente.end();
}
