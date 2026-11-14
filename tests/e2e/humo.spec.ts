import { expect, test } from '@playwright/test';

test('la raíz muestra el nombre del sistema', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: /reservas deportivas/i })).toBeVisible();
});
