import 'dotenv/config';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { chromium, devices } from '@playwright/test';

// Genera las capturas del README en docs/capturas-raw (PNG) con datos de
// demostracion. Luego: node scripts/optimizar-imagenes.mjs
// Uso: node scripts/capturar-pantallas.mjs

const CLAVE_PRUEBA_QA = process.env.CLAVE_PRUEBA_QA;
if (!CLAVE_PRUEBA_QA || CLAVE_PRUEBA_QA.length < 10) {
  console.error('Error: define CLAVE_PRUEBA_QA con al menos 10 caracteres (clave de prueba QA, no fijada en código).');
  process.exit(1);
}

const BASE = process.env.CAPTURA_BASE ?? 'http://127.0.0.1:3100';
const SALIDA = join(process.cwd(), 'docs', 'capturas-raw');
const QA = {
  super: { email: 'test-super@gmail.com', clave: CLAVE_PRUEBA_QA },
  admin: { email: 'test-admin@gmail.com', clave: CLAVE_PRUEBA_QA },
  user: { email: 'test-user@gmail.com', clave: CLAVE_PRUEBA_QA },
};

const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

rmSync(SALIDA, { recursive: true, force: true });
mkdirSync(SALIDA, { recursive: true });

async function sesion(browser, cred) {
  const context = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    extraHTTPHeaders: { origin: BASE },
    locale: 'es-PE',
  });
  const login = await context.request.post(`${BASE}/api/auth/login`, { data: cred });
  if (!login.ok()) throw new Error(`login ${cred.email}: ${login.status()}`);
  const valor = /access_token=([^;]+)/.exec(login.headers()['set-cookie'] ?? '')?.[1] ?? '';
  await context.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
  return context;
}

async function capturar(page, ruta, nombre, entera = false) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(SALIDA, `${nombre}.png`), fullPage: entera });
  console.log(`captura: ${nombre}`);
}

const browser = await chromium.launch();
try {
  const anon = await browser.newContext({
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
    locale: 'es-PE',
  });
  const anonPage = await anon.newPage();
  await anonPage.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await anonPage.waitForTimeout(600);
  await anonPage.screenshot({ path: join(SALIDA, 'portada.png') });
  console.log('captura: portada');
  await anonPage.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await anonPage.waitForTimeout(300);
  await anonPage.screenshot({ path: join(SALIDA, 'login.png') });
  console.log('captura: login');
  await anon.close();

  const userCtx = await sesion(browser, QA.user);
  const user = await userCtx.newPage();
  await user.goto(`${BASE}/reservar`, { waitUntil: 'networkidle' });
  // Por nombre de campo y no por etiqueta: las insignias de estado de la lista
  // de reservas también tienen aria-label y ensucian el getByLabel.
  await user.locator('select[name="sedeId"]').selectOption({ index: 1 });
  await user.waitForTimeout(800);
  await user.locator('select[name="canchaId"]').selectOption({ index: 1 });
  await user.locator('input[name="fecha"]').fill(iso(new Date(Date.now() + 24 * 3_600_000)));
  await user.locator('input[name="horaInicio"]').fill('18:00');
  await user.waitForTimeout(600);
  await user.screenshot({ path: join(SALIDA, 'reservar.png') });
  console.log('captura: reservar');
  await user.goto(`${BASE}/reservar`, { waitUntil: 'networkidle' });
  await user.waitForTimeout(600);
  await user.screenshot({ path: join(SALIDA, 'mis-reservas.png'), fullPage: true });
  console.log('captura: mis-reservas');
  await userCtx.close();

  const adminCtx = await sesion(browser, QA.admin);
  const admin = await adminCtx.newPage();
  // Fecha con historial para que los cuadros no salgan en cero.
  await capturar(admin, '/configuracion?fecha=2026-09-15', 'dashboard-admin');
  await capturar(admin, '/kpis?mes=2026-09&fecha=2026-09-15', 'indicadores');
  await capturar(admin, '/reportes?tipo=ingresos&mes=2026-09', 'reportes');
  await capturar(admin, '/pendientes', 'pendientes');
  await capturar(admin, '/bloqueos', 'mantenimiento');
  await capturar(admin, '/canchas', 'canchas');
  await capturar(admin, '/tarifas', 'tarifas');
  await adminCtx.close();

  const superCtx = await sesion(browser, QA.super);
  const sup = await superCtx.newPage();
  await capturar(sup, '/sedes', 'sedes');
  await capturar(sup, '/usuarios', 'administradores');
  await capturar(sup, '/configuracion?fecha=2026-09-15&sede=todas', 'dashboard-global', true);
  await sup.goto(`${BASE}/configuracion?fecha=2026-09-15&sede=todas`, { waitUntil: 'networkidle' });
  await sup.waitForTimeout(500);
  await sup.screenshot({ path: join(SALIDA, 'grilla-diaria.png') });
  console.log('captura: grilla-diaria');
  // La gramática de estados, no la paleta: se baja hasta su encabezado.
  await sup.goto(`${BASE}/design-preview`, { waitUntil: 'networkidle' });
  await sup.locator('#pv-estados').scrollIntoViewIfNeeded();
  await sup.waitForTimeout(500);
  await sup.screenshot({ path: join(SALIDA, 'estados.png') });
  console.log('captura: estados');
  await superCtx.close();
} finally {
  await browser.close();
}
console.log(`Capturas en ${SALIDA}`);
