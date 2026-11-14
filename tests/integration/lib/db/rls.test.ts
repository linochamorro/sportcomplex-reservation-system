import 'dotenv/config';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const TABLAS = [
  'Sede',
  'Cancha',
  'Tarifa',
  'Usuario',
  'Solicitud',
  'Comprobante',
  'BloqueoCancha',
  'AccionReservaAfectada',
  'Notificacion',
  'PasswordResetToken',
  'IntentoLogin',
  'OperacionPendiente',
  'RegistroCambio',
  '_prisma_migrations',
];

let cliente: Client;

beforeAll(async () => {
  cliente = new Client({ connectionString: process.env.DIRECT_URL });
  await cliente.connect();
});

afterAll(async () => {
  await cliente?.end();
});

describe('RLS desde día uno (A-02/AC-02)', () => {
  it('todas las tablas tienen RLS activado y forzado', async () => {
    const { rows } = await cliente.query(
      `select c.relname as tabla from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r'
       and c.relrowsecurity and c.relforcerowsecurity`,
    );
    const nombres = rows.map((f) => f.tabla).sort();
    expect(nombres).toEqual([...TABLAS].sort());
  });

  it('un rol sin políticas ve cero filas en todas las tablas', async () => {
    // El pooler exige el usuario en el connection string (no usa el campo `user`
    // de pg), así que se reemplaza la credencial manteniendo el tenant.
    // Nombre único por ejecución: evita colisiones entre workers en paralelo.
    const rol = `rls_probe_${process.pid}_${Date.now().toString(36)}`;
    const clave = 'Temporal_Solo_Prueba_9x';
    // Cada sonda usa su propia conexión privilegiada para no depender del estado
    // compartido entre tests.
    const admin = new Client({ connectionString: process.env.DIRECT_URL });
    await admin.connect();
    const base = new URL(process.env.DIRECT_URL as string);
    const tenant = base.username.split('.')[1] ?? 'postgres';
    const limitado = new Client({
      connectionString: `postgresql://${rol}.${tenant}:${encodeURIComponent(clave)}@${base.hostname}:${base.port}${base.pathname}`,
    });
    try {
      await admin.query(`create role ${rol} login password '${clave}'`);
      await admin.query(`grant connect on database postgres to ${rol}`);
      await admin.query(`grant usage on schema public to ${rol}`);
      await admin.query(`grant select on all tables in schema public to ${rol}`);
      await limitado.connect();
      for (const tabla of TABLAS) {
        const resultado = await limitado.query(`select 1 from public."${tabla}"`);
        expect(resultado.rowCount).toBe(0);
      }
    } finally {
      await limitado.end().catch(() => undefined);
      await admin.query(`drop owned by ${rol}`).catch(() => undefined);
      await admin.query(`drop role if exists ${rol}`).catch(() => undefined);
      await admin.end().catch(() => undefined);
    }
  });
});
