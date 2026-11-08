import 'dotenv/config';
import { expect, test, type APIRequestContext, type Browser, type BrowserContext } from '@playwright/test';
import { Client } from 'pg';

const CLAVE_QA = process.env.CLAVE_PRUEBA_QA ?? '';
if (!CLAVE_QA) throw new Error('Falta CLAVE_PRUEBA_QA: ejecuta CLAVE_PRUEBA_QA=... node scripts/crear-usuarios-prueba.mjs antes de este spec.');

// Calidad del catálogo público y del precio mostrado:
// 1) /api/sedes no expone sedes de prueba (E2E_*).
// 2) El precio que anuncia el desplegable de canchas es el rango real de las
//    tarifas de la sede (nunca la tarifa base heredada de la creación).
// 3) Ese rango coincide con lo que cobra la API al reservar.

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

test.describe.serial('QA catálogo y precio', () => {
  let adminCtx: BrowserContext;
  let userCtx: BrowserContext;
  let superCtx: BrowserContext;
  let adminApi: APIRequestContext;
  let userApi: APIRequestContext;
  let superApi: APIRequestContext;

  test.beforeAll(async ({ browser }) => {
    ({ context: adminCtx, api: adminApi } = await sesion(browser, { email: 'test-admin@gmail.com', clave: CLAVE_QA }));
    ({ context: userCtx, api: userApi } = await sesion(browser, { email: 'test-user@gmail.com', clave: CLAVE_QA }));
    // El SUPERADMIN lee el catálogo completo (el ADMIN solo su sede).
    ({ context: superCtx, api: superApi } = await sesion(browser, { email: 'test-super@gmail.com', clave: CLAVE_QA }));
  });

  test.afterAll(async () => {
    await adminCtx?.close();
    await userCtx?.close();
    await superCtx?.close();
  });

  test('el catálogo de sedes no expone sedes de prueba', async () => {
    const respuesta = await userApi.get('/api/sedes');
    expect(respuesta.ok()).toBe(true);
    const { sedes } = (await respuesta.json()) as { sedes: Array<{ id: number; nombre: string }> };
    const intrusas = sedes.filter((s) => /^E2E_|^QA |^SyncB_/i.test(s.nombre));
    expect(intrusas.map((s) => s.nombre)).toEqual([]);
    // El selector de /reservar solo ofrece sedes reales.
    const pagina = await userCtx.newPage();
    await pagina.goto('/reservar');
    await expect(pagina.locator('select[name="sedeId"]').locator('option', { hasText: 'Los Olivos' })).toHaveCount(1);
    const opciones = await pagina.locator('select[name="sedeId"]').locator('option').allTextContents();
    expect(opciones.join('|')).not.toMatch(/E2E_|SyncB_/);
    expect(opciones).toEqual(expect.arrayContaining(['Los Olivos', 'Los Precursores', 'Los Próceres']));
    await pagina.close();
    // El panel del administrador sí las ve (las gestiona).
    const conPruebas = await adminApi.get('/api/sedes?incluirPruebas=1');
    const todas = (await conPruebas.json()) as { sedes: Array<{ nombre: string }> };
    expect(todas.sedes.some((s) => /^E2E_QA$/i.test(s.nombre))).toBe(true);
    // Un USUARIO no puede forzarlas por parámetro.
    const forzado = await userApi.get('/api/sedes?incluirPruebas=1');
    const filtrado = (await forzado.json()) as { sedes: Array<{ nombre: string }> };
    expect(filtrado.sedes.some((s) => /^E2E_/i.test(s.nombre))).toBe(false);
  });

  test('el precio del desplegable es el rango real de tarifas y coincide con el cobro', async () => {
    const cliente = new Client({ connectionString: process.env.DIRECT_URL });
    await cliente.connect();
    let sedeId = 0;
    try {
      const sede = await cliente.query(`SELECT id FROM "Sede" WHERE nombre = 'Los Próceres' AND "eliminadoEn" IS NULL`);
      sedeId = sede.rows[0].id as number;
    } finally {
      await cliente.end();
    }

    const tarifas = (await (
      await superApi.get(`/api/tarifas?sedeId=${sedeId}`)
    ).json()) as { tarifas: Array<{ montoCentavos: number }> };
    const montos = tarifas.tarifas.map((t) => t.montoCentavos);
    expect(montos.length).toBeGreaterThan(0);
    const min = Math.min(...montos);
    const max = Math.max(...montos);
    const esperado = min === max ? `S/ ${min / 100} por hora` : `S/ ${min / 100} a S/ ${max / 100} según día y hora`;

    const pagina = await userCtx.newPage();
    await pagina.goto('/reservar');
    await pagina.locator('select[name="sedeId"]').selectOption({ label: 'Los Próceres' });
    const opcionCancha = pagina.locator('select[name="canchaId"]').locator('option', { hasText: 'PRO-C01' });
    await expect(opcionCancha).toHaveText(`PRO-C01 · ${esperado}`);
    await expect(opcionCancha).not.toHaveText(/10 soles/);
    await pagina.close();

    // El cobro real cae dentro del rango anunciado.
    const canchas = (await (await superApi.get(`/api/canchas?sedeId=${sedeId}`)).json()) as {
      canchas: Array<{ id: number; nombre: string }>;
    };
    const proC01 = canchas.canchas.find((c) => c.nombre === 'PRO-C01') as { id: number };
    const fecha = new Date(Date.now() + 3 * 24 * 3_600_000).toISOString().slice(0, 10);
    const creada = await userApi.post('/api/solicitudes', {
      data: { canchaId: proC01.id, fecha, horaInicio: '10:00' },
    });
    expect(creada.status()).toBe(201);
    const cuerpo = (await creada.json()) as { id: number; montoTotalCentavos: number };
    expect(cuerpo.montoTotalCentavos).toBeGreaterThanOrEqual(min);
    expect(cuerpo.montoTotalCentavos).toBeLessThanOrEqual(max);

    const limpieza = new Client({ connectionString: process.env.DIRECT_URL });
    await limpieza.connect();
    try {
      await limpieza.query(`DELETE FROM "Solicitud" WHERE id = $1`, [cuerpo.id]);
    } finally {
      await limpieza.end();
    }
  });
});
