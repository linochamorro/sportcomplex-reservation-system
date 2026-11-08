import { expect, test } from '@playwright/test';
import { turnoLibreEnSedeReal } from './sede-real';

// Flujo USUARIO de extremo a extremo: registro → login → reservar → mis-reservas.
test('flujo completo de reserva en navegador', async ({ page }) => {
  // Sede real (no de prueba): es lo único que ofrece el desplegable de /reservar.
  const turno = await turnoLibreEnSedeReal();
  const email = `flujo_${Date.now()}@e2e.local`;
  const manana = turno.fecha;

  await page.goto('/registro');
  await page.getByLabel(/nombre completo/i).fill('Flujo E2E');
  await page.getByLabel(/correo/i).fill(email);
  await page.getByLabel(/clave/i).fill('Flujo_E2E_99');
  await page.getByRole('button', { name: /crear cuenta/i }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByRole('button', { name: /^aceptar/i }).click();
  await expect(page).toHaveURL(/\/$/);

  await page.goto('/login');
  await page.getByLabel(/correo/i).fill(email);
  await page.getByLabel(/clave/i).fill('Flujo_E2E_99');
  await page.getByRole('button', { name: /^entrar/i }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto('/reservar');

  await page.locator('select[name="sedeId"]').selectOption(String(turno.sedeId));
  await page.locator('select[name="canchaId"]').selectOption(String(turno.canchaId));
  await page.locator('input[name="fecha"]').fill(manana);
  await page.locator('input[name="horaInicio"]').fill(turno.hora);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: /solicitar/i }).click();
  await expect(page).toHaveURL(/\/reservar/);
  // La fila muestra cancha, fecha y estado; la fecha va en el texto de la fila,
  // no en un encabezado.
  await expect(page.getByText(manana).first()).toBeVisible();
  await expect(page.getByText(`${turno.canchaNombre} · ${manana} · ${turno.hora}`).first()).toBeVisible();
  await expect(page.getByText(/pendiente de confirmación/i).first()).toBeVisible();
  const propias = await page.request.get('/api/solicitudes');
  expect(propias.ok()).toBe(true);
  const propiasJson = (await propias.json()) as { solicitudes: Array<{ id: number; estado: string }> };
  const propia = propiasJson.solicitudes.find((s) => s.estado === 'PENDIENTE');
  expect(propia, 'la reserva recién creada debe estar PENDIENTE').toBeDefined();
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.SUPABASE_STORAGE_BUCKET) {
    return;
  }
  const comprobante = await page.request.post(`/api/solicitudes/${propia!.id}/comprobante`, {
    headers: { origin: 'http://127.0.0.1:3100' },
    data: {
      bytesBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
      nombreArchivo: 'comprobante.png',
      contentType: 'image/png',
    },
  });
  expect(comprobante.status()).toBe(201);
});
