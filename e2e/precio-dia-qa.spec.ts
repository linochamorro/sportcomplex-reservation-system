import 'dotenv/config';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import { Client } from 'pg';

const CLAVE_QA = process.env.CLAVE_PRUEBA_QA ?? '';
if (!CLAVE_QA) throw new Error('Falta CLAVE_PRUEBA_QA: ejecuta CLAVE_PRUEBA_QA=... node scripts/crear-usuarios-prueba.mjs antes de este spec.');

// Precio por día de semana: la misma hora en lunes y sábado cobra la tarifa
// del día que corresponde. Usa sede temporal propia y la limpia al final.

function proximoDia(dow: number): string {
  const base = new Date(Date.now() + 2 * 24 * 3_600_000);
  while (base.getUTCDay() !== dow) base.setUTCDate(base.getUTCDate() + 1);
  return base.toISOString().slice(0, 10);
}

async function sesion(
  browser: Browser,
  cred: { email: string; clave: string },
): Promise<{ context: BrowserContext; api: APIRequestContext }> {
  const context = await browser.newContext({ extraHTTPHeaders: { origin: 'http://127.0.0.1:3100' } });
  const login = await context.request.post('/api/auth/login', { data: cred });
  expect(login.ok()).toBe(true);
  const valor = /access_token=([^;]+)/.exec(login.headers()['set-cookie'] ?? '')?.[1] ?? '';
  await context.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
  return { context, api: context.request };
}

test.describe.serial('QA precio por día', () => {
  let superCtx: BrowserContext;
  let userCtx: BrowserContext;
  let superApi: APIRequestContext;
  let userApi: APIRequestContext;
  let sedeId = 0;
  let canchaId = 0;

  test.beforeAll(async ({ browser }) => {
    ({ context: superCtx, api: superApi } = await sesion(browser, { email: 'test-super@gmail.com', clave: CLAVE_QA }));
    ({ context: userCtx, api: userApi } = await sesion(browser, { email: 'test-user@gmail.com', clave: CLAVE_QA }));
    const sede = await superApi.post('/api/sedes', {
      data: { nombre: 'QA Precio Día', esPrueba: true, apertura: '08:00', cierre: '22:00' },
    });
    expect(sede.status()).toBe(201);
    sedeId = ((await sede.json()) as { id: number }).id;
    const cancha = await superApi.post('/api/canchas', {
      data: { sedeId, nombre: 'QA-PD1', tarifaBaseCentavos: 1000 },
    });
    expect(cancha.status()).toBe(201);
    canchaId = ((await cancha.json()) as { id: number }).id;
    for (const [nombre, dias, monto] of [
      ['QA-PD LV', [1, 2, 3, 4, 5], 5000],
      ['QA-PD FS', [0, 6], 8000],
    ] as const) {
      const t = await superApi.post('/api/tarifas', {
        data: { sedeId, nombre, diasSemana: [...dias], horaInicio: '08:00', horaFin: '18:00', montoCentavos: monto },
      });
      expect(t.status()).toBe(201);
    }
  });

  test.afterAll(async () => {
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    try {
      const qa = await cliente.query(`select id from "Usuario" where email = 'test-user@gmail.com'`);
      const ids = qa.rows.map((u) => u.id as number);
      if (ids.length > 0) {
        await cliente.query(`delete from "Solicitud" where "usuarioId" = any($1) and "canchaId" = $2`, [ids, canchaId]);
      }
      await cliente.query(`delete from "Tarifa" where "sedeId" = $1`, [sedeId]);
      await cliente.query(`delete from "Cancha" where "sedeId" = $1`, [sedeId]);
      await cliente.query(`delete from "Sede" where id = $1`, [sedeId]);
    } finally {
      await cliente.end();
    }
    await superCtx?.close();
    await userCtx?.close();
  });

  test('lunes cobra tarifa LV y sábado tarifa FS a la misma hora', async () => {
    const lunes = proximoDia(1);
    const sabado = proximoDia(6);
    const r1 = await userApi.post('/api/solicitudes', { data: { canchaId, fecha: lunes, horaInicio: '10:00' } });
    expect(r1.status()).toBe(201);
    expect(((await r1.json()) as { montoTotalCentavos: number }).montoTotalCentavos).toBe(5000);
    const r2 = await userApi.post('/api/solicitudes', { data: { canchaId, fecha: sabado, horaInicio: '10:00' } });
    expect(r2.status()).toBe(201);
    expect(((await r2.json()) as { montoTotalCentavos: number }).montoTotalCentavos).toBe(8000);
  });
});
