import { expect, test } from '@playwright/test';

// C-02/AC-01 + AC-03: cero 404 y guards redirigen a /login sin sesión.
const PROTEGIDAS = [
  '/reservar',
  '/mis-reservas',
  '/notificaciones',
  '/ayuda',
  '/grilla?sede=1',
  '/pendientes',
  '/bloqueos',
  '/kpis',
  '/consolidado',
  '/configuracion',
  '/mi-cuenta',
  '/sedes',
  '/canchas',
  '/tarifas',
  '/usuarios',
];

for (const ruta of PROTEGIDAS) {
  test(`sin sesión ${ruta} redirige a login (no 404)`, async ({ page }) => {
    const respuesta = await page.goto(ruta);
    expect(respuesta?.status()).not.toBe(404);
    await expect(page).toHaveURL(/\/login/);
  });
}

test('/login y /registro renderizan formularios', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: /iniciar sesión/i })).toBeVisible();
  await page.goto('/registro');
  await expect(page.getByRole('heading', { name: /crear cuenta/i })).toBeVisible();
  await page.goto('/recuperar-clave');
  await expect(page.getByRole('heading', { name: /recuperar clave/i })).toBeVisible();
});

test('/design-preview sigue disponible', async ({ page }) => {
  await page.goto('/design-preview');
  await expect(page.getByRole('heading', { name: /vista previa/i })).toBeVisible();
});
