import 'dotenv/config';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { Client } from 'pg';
import { limpiarRestos } from './global-setup';

/**
 * Cierra la corrida borrando TODOS los restos de e2e (sedes `E2E_*` y usuarios
 * `@e2e.local`), no solo los de la corrida actual: si una corrida previa quedó
 * abortada, este teardown también la limpia.
 */
export default async function teardown() {
  const cliente = new Client({ connectionString: process.env.DIRECT_URL });
  await cliente.connect();
  try {
    const sedes = await limpiarRestos(cliente);
    console.log(`e2e teardown: ${sedes} sede(s) E2E_* y usuarios @e2e.local eliminados.`);
  } finally {
    await cliente.end();
    rmSync(join(process.cwd(), 'e2e', '.semilla-e2e.json'), { force: true });
  }
}
