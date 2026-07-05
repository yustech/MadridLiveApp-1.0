import { expect, test } from '@playwright/test';

async function loginWithDemo(page: import('@playwright/test').Page) {
  await page.goto('/');

  const alreadyInside = await page.getByRole('button', { name: /Eventos \/ Control/i }).isVisible().catch(() => false);
  if (alreadyInside) return;

  await page.getByRole('button', { name: /Rellenar Credenciales Demo/i }).click();
  await page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i }).click();
  await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();
}

test.describe('MadridLiveApp regression', () => {
  test('[readonly] API health and staff endpoints respond', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    await expect(health.json()).resolves.toMatchObject({ status: 'ok' });

    const staff = await request.get('/api/mysql/staff');
    const staffJson = await staff.json().catch(() => null);

    if (staff.ok()) {
      expect(Array.isArray(staffJson)).toBeTruthy();
      expect((staffJson as unknown[]).length).toBeGreaterThan(0);
      return;
    }

    // CI runners often don't provide MySQL env vars. Treat this specific
    // unconfigured backend response as non-regression for UI readonly checks.
    expect(staff.status()).toBe(500);
    expect(staffJson).toMatchObject({
      error: expect.stringContaining('MySQL is not configured'),
    });
  });

  test('[readonly] denies invalid login', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[placeholder="••••••••"]').first().fill('BADPASS');
    await page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i }).click();
    await expect(page.getByText(/ACCESO DENEGADO/i)).toBeVisible();
  });

  test('[readonly] navigates across core modules after login', async ({ page }) => {
    await loginWithDemo(page);

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await expect(page.getByRole('button', { name: /Ingreso Manual de ID/i })).toBeVisible();

    await page.getByRole('button', { name: /Plantilla/i }).click();
    await expect(page.getByRole('heading', { name: /Plantilla de Personal/i })).toBeVisible();

    await page.getByRole('button', { name: /Historial Registros/i }).click();
    await expect(page.getByRole('heading', { name: /Historial de Registros/i })).toBeVisible();

    await page.getByRole('button', { name: /KPIs y Estadísticas/i }).click();
    await expect(page.getByRole('heading', { name: /Métricas & KPIs/i })).toBeVisible();
  });

  test('[readonly] shows validation error for invalid manual scanner id', async ({ page }) => {
    await loginWithDemo(page);

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await page.getByRole('button', { name: /Ingreso Manual de ID/i }).click();
    await page.locator('input[placeholder*="SEC-042"]').fill('INVALID-XYZ');
    await page.getByRole('button', { name: /^ENVIAR$/i }).click();

    await expect(page.getByText(/ID o nombre inválido/i)).toBeVisible();
  });
});
