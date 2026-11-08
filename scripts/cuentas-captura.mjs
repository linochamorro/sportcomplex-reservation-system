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

// Cuentas de captura: el ADMIN se asigna a una sede real con historial para
// que las capturas del README muestren datos y no ceros.
const SEDE = process.env.SEDE_CAPTURA ?? 'Los Olivos';
const USUARIOS = [
  { email: 'test-super@gmail.com', rol: 'SUPERADMIN', conSede: false },
  { email: 'test-admin@gmail.com', rol: 'ADMIN', conSede: true },
  { email: 'test-user@gmail.com', rol: 'USUARIO', conSede: false },
];

const cliente = new pg.Client({ connectionString: process.env.DIRECT_URL });
await cliente.connect();
try {
  const sede = await cliente.query(`select id from "Sede" where nombre = $1 and "eliminadoEn" is null`, [SEDE]);
  const sedeId = sede.rows[0]?.id ?? null;
  if (!sedeId) throw new Error(`sede "${SEDE}" no encontrada`);
  for (const u of USUARIOS) {
    const hash = await bcryptjs.hash(CLAVE_PRUEBA_QA, 10);
    const existe = await cliente.query(`select id from "Usuario" where email = $1`, [u.email]);
    if (existe.rows.length > 0) {
      // Se resetea también el nombre: las pruebas de seguridad lo renombran a
      // "Hacker" y ese texto se colaría en las capturas del README.
      await cliente.query(
        `update "Usuario" set "passwordHash" = $2, nombre = $5, rol = $3, "sedeId" = $4, "eliminadoEn" = null, "actualizadoEn" = now()
         where email = $1`,
        [u.email, hash, u.rol, u.conSede ? sedeId : null, 'QA Captura'],
      );
    } else {
      await cliente.query(
        `insert into "Usuario" (email, "passwordHash", nombre, rol, "sedeId", "actualizadoEn")
         values ($1, $2, $3, $4, $5, now())`,
        [u.email, hash, 'QA Captura', u.rol, u.conSede ? sedeId : null],
      );
    }
    console.log(`${u.email} -> ${u.rol}${u.conSede ? ` (${SEDE})` : ''}`);
  }
} finally {
  await cliente.end();
}
