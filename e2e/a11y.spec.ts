import AxeBuilder from '@axe-core/playwright';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { primeraSedeRealConCanchas } from './sede-real';

// C-03: accesibilidad medida en render (axe) + responsive en 2 viewports.
async function sinViolaciones(page: Page, ruta: string) {
  await page.goto(ruta);
  const resultado = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa'])
    .disableRules(['color-contrast'])
    .analyze();
  expect(resultado.violations, JSON.stringify(resultado.violations.slice(0, 3))).toEqual([]);
}

async function contrasteOk(page: Page, ruta: string) {
  await page.goto(ruta);
  const resultado = await new AxeBuilder({ page }).withRules(['color-contrast']).analyze();
  expect(resultado.violations, JSON.stringify(resultado.violations.slice(0, 5))).toEqual([]);
}

test('a11y páginas públicas', async ({ page }) => {
  await sinViolaciones(page, '/login');
  await sinViolaciones(page, '/registro');
  await sinViolaciones(page, '/design-preview');
});

test('contraste medido en render', async ({ page }) => {
  await contrasteOk(page, '/login');
  await contrasteOk(page, '/design-preview');
});

test('autenticado: reservar y mis-reservas sin violaciones + contraste', async ({ browser }) => {
  const contexto = await browser.newContext({
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3100' },
  });
  const email = `a11y_${Date.now()}@e2e.local`;
  const api = await contexto.request.post('/api/auth/register', {
    data: { email, clave: 'A11y_E2E_99', nombre: 'A11y' },
  });
  expect(api.ok()).toBe(true);
  const login = await contexto.request.post('/api/auth/login', { data: { email, clave: 'A11y_E2E_99' } });
  expect(login.ok()).toBe(true);
  const setCookie = login.headers()['set-cookie'] ?? '';
  const valor = /access_token=([^;]+)/.exec(setCookie)?.[1] ?? '';
  await contexto.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
  const page = await contexto.newPage();
  await sinViolaciones(page, '/reservar');
  await contrasteOk(page, '/reservar');
  await sinViolaciones(page, '/mis-reservas');
  await contexto.close();
});

test('autenticado ADMIN: grilla y pendientes sin violaciones + contraste', async ({ browser }) => {
  const contexto = await browser.newContext({
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3100' },
  });
  const semilla = JSON.parse(readFileSync(join(process.cwd(), 'e2e', '.semilla-e2e.json'), 'utf8')) as {
    sedeId: number;
    claveA11yAdmin: string;
  };
  const login = await contexto.request.post('/api/auth/login', {
    data: { email: 'a11y_admin@e2e.local', clave: semilla.claveA11yAdmin },
  });
  expect(login.ok()).toBe(true);
  const setCookie = login.headers()['set-cookie'] ?? '';
  const valor = /access_token=([^;]+)/.exec(setCookie)?.[1] ?? '';
  expect(valor.length).toBeGreaterThan(0);
  await contexto.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
  const page = await contexto.newPage();
  await sinViolaciones(page, `/grilla?sede=${semilla.sedeId}`);
  await contrasteOk(page, `/grilla?sede=${semilla.sedeId}`);
  await sinViolaciones(page, '/pendientes');
  await contrasteOk(page, '/pendientes');
  await contexto.close();
});

test('formulario con error visible y foco (AC-02)', async ({ browser }) => {
  const contexto = await browser.newContext({
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3100' },
  });
  const email = `a11yf_${Date.now()}@e2e.local`;
  await contexto.request.post('/api/auth/register', { data: { email, clave: 'A11y_E2E_99', nombre: 'A11y' } });
  const login = await contexto.request.post('/api/auth/login', { data: { email, clave: 'A11y_E2E_99' } });
  const valor = /access_token=([^;]+)/.exec(login.headers()['set-cookie'] ?? '')?.[1] ?? '';
  await contexto.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
  const page = await contexto.newPage();
  const sede = await primeraSedeRealConCanchas();
  const manana = new Date(Date.now() + 24 * 3_600_000).toISOString().slice(0, 10);
  const erroresConsola: string[] = [];
  page.on('console', (mensaje) => {
    if (mensaje.type() === 'error') erroresConsola.push(mensaje.text());
  });
  const sedesCargadas = page.waitForResponse((respuesta) => respuesta.url().endsWith('/api/sedes'));
  await page.goto('/reservar');
  expect(erroresConsola).toEqual([]);
  const respuestaSedes = await sedesCargadas;
  expect(respuestaSedes.ok(), await respuestaSedes.text()).toBe(true);
  await page.locator('select[name="sedeId"]').selectOption(String(sede.sedeId));
  await page.locator('select[name="canchaId"]').selectOption(String(sede.canchaId));
  await page.locator('input[name="fecha"]').fill(manana);
  await page.locator('input[name="horaInicio"]').fill('10:00');
  // Sin aceptar la condición: alerta visible con foco.
  await page.getByRole('button', { name: /solicitar/i }).click();
  const alerta = page.locator('form[aria-label="Solicitar reserva"] [role="alert"]');
  await expect(alerta).toHaveText(/no cancelación/i);
  await expect(alerta).toBeFocused();
  await contexto.close();
});

test('responsive: nav inferior en móvil, lateral en escritorio', async ({ browser }) => {  const email = `a11yr_${Date.now()}@e2e.local`;
  const previo = await browser.newContext({
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3100' },
  });
  await previo.request.post('/api/auth/register', { data: { email, clave: 'A11y_E2E_99', nombre: 'A11y' } });
  const login = await previo.request.post('/api/auth/login', { data: { email, clave: 'A11y_E2E_99' } });
  const valor = /access_token=([^;]+)/.exec(login.headers()['set-cookie'] ?? '')?.[1] ?? '';
  await previo.close();

  const movil = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await movil.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
  const pm = await movil.newPage();
  await pm.goto('/reservar');
  await expect(pm.locator('nav[aria-label="Navegación principal"]')).not.toBeVisible();
  await expect(pm.locator('nav[aria-label^="Navegación inferior"]')).toBeVisible();
  await movil.close();

  const escritorio = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  await escritorio.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
  const pe = await escritorio.newPage();
  await pe.goto('/reservar');
  await expect(pe.locator('nav[aria-label="Navegación principal"]')).toBeVisible();
  await expect(pe.locator('nav[aria-label^="Navegación inferior"]')).not.toBeVisible();
  await escritorio.close();
});
