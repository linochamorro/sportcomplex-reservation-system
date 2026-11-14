import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type BrowserContext } from '@playwright/test';
import { primeraSedeRealConCanchas, turnoLibreEnSedeReal } from './sede-real';

async function sesion(context: BrowserContext, email: string, clave: string): Promise<void> {
  const login = await context.request.post('/api/auth/login', { data: { email, clave } });
  expect(login.ok()).toBe(true);
  const valor = /access_token=([^;]+)/.exec(login.headers()['set-cookie'] ?? '')?.[1] ?? '';
  expect(valor.length).toBeGreaterThan(0);
  await context.addCookies([{ name: 'access_token', value: valor, domain: '127.0.0.1', path: '/' }]);
}

test('SUPERADMIN accede a las vistas globales', async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3100' },
  });
  const semilla = JSON.parse(readFileSync(join(process.cwd(), 'e2e', '.semilla-e2e.json'), 'utf8')) as {
    claveSuperadmin: string;
  };
  await sesion(context, 'e2e_superadmin@e2e.local', semilla.claveSuperadmin);
  const page = await context.newPage();
  await page.goto('/consolidado');
  await expect(page).toHaveURL(/\/configuracion/);
  await expect(page.getByRole('heading', { name: /^dashboard$/i })).toBeVisible();
  await page.goto('/sedes');
  await expect(page.locator('h1')).toHaveText('Sedes');
  await page.goto('/usuarios');
  await expect(page.locator('h1')).toHaveText('Administrador');
  await context.close();
});

test('sin conexión la reserva queda en cola y llega al servidor al reconectar', async ({ browser }) => {
  const context = await browser.newContext({
    extraHTTPHeaders: { origin: 'http://127.0.0.1:3100' },
  });
  const email = `offline_${Date.now()}@e2e.local`;
  await context.request.post('/api/auth/register', { data: { email, clave: 'Offline_E2E_99', nombre: 'Offline' } });
  await sesion(context, email, 'Offline_E2E_99');
  const page = await context.newPage();
  await page.goto('/reservar');
  const turno = await turnoLibreEnSedeReal();
  await page.locator('select[name="sedeId"]').selectOption(String(turno.sedeId));
  await page.locator('select[name="canchaId"]').selectOption(String(turno.canchaId));
  await page.locator('input[name="fecha"]').fill(turno.fecha);
  await page.locator('input[name="horaInicio"]').fill(turno.hora);
  await page.getByRole('checkbox').check();
  await context.setOffline(true);
  try {
    await page.getByRole('button', { name: /solicitar/i }).click();
    // Promesa cumplida: la solicitud queda en la outbox del dispositivo, no se
    // pierde. Antes el texto decía "se enviará al conectar" sin guardarla.
    await expect(page.getByText(/quedó en cola/i)).toBeVisible();
    await expect(page.getByText(/en cola/i).first()).toBeVisible();
  } finally {
    await context.setOffline(false);
  }
  try {
    // Al volver la conexión, el sincronizador empuja la cola: el servidor la
    // ejecuta y la reserva existe de verdad.
    await expect
      .poll(
        async () => {
          const lista = await context.request.get('/api/solicitudes');
          const cuerpo = (await lista.json()) as { solicitudes: Array<{ fecha: string; horaInicio: string }> };
          return cuerpo.solicitudes.filter((s) => s.fecha === turno.fecha && s.horaInicio === turno.hora).length;
        },
        { timeout: 30_000 },
      )
      .toBe(1);
  } finally {
    await context.close();
  }
});

test('mantenimiento exige Bearer y responde con el secreto', async ({ request }) => {
  const sinBearer = await request.get('/api/mantenimiento');
  const secreto = process.env.CRON_SECRET;
  if (!secreto) {
    expect(sinBearer.status()).toBe(503);
    return;
  }
  expect(sinBearer.status()).toBe(401);
  const conBearer = await request.get('/api/mantenimiento', {
    headers: { authorization: `Bearer ${secreto}` },
  });
  expect(conBearer.ok()).toBe(true);
  const cuerpo = (await conBearer.json()) as { liberadas: number; recordatorios: number };
  expect(typeof cuerpo.liberadas).toBe('number');
  expect(typeof cuerpo.recordatorios).toBe('number');
});
