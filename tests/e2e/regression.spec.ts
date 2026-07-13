import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD || '';

async function loginWithAdmin(page: import('@playwright/test').Page) {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD are required for login UI tests.');

  await page.goto('/');

  const alreadyInside = await page.getByRole('button', { name: /Eventos \/ Control/i }).isVisible().catch(() => false);
  if (alreadyInside) return;

  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i }).click();
  await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();
}

test.describe('MadridLiveApp regression', () => {
  test('[readonly] API health responds and MySQL data endpoints require auth', async ({ request }) => {
    const health = await request.get('/api/health');
    expect(health.ok()).toBeTruthy();
    await expect(health.json()).resolves.toMatchObject({ status: 'ok' });

    const mysqlHealth = await request.get('/api/mysql/health-count');
    const mysqlHealthJson = await mysqlHealth.json().catch(() => null);

    if (mysqlHealth.ok()) {
      const staffCount = Number((mysqlHealthJson as { counts?: { staff?: number }; staffCount?: number } | null)?.counts?.staff ?? (mysqlHealthJson as { staffCount?: number } | null)?.staffCount ?? 0);
      expect(staffCount).toBeGreaterThan(0);
    } else {
      // CI runners may not provide MySQL env vars. Treat this specific
      // unconfigured backend response as non-regression for UI readonly checks.
      expect(mysqlHealth.status()).toBe(503);
      const apiErrorMessage = String((mysqlHealthJson as { message?: string; error?: string } | null)?.message || (mysqlHealthJson as { message?: string; error?: string } | null)?.error || '');
      expect(apiErrorMessage).toContain('MySQL is not configured');
    }

    await expect((await request.get('/api/mysql/staff')).status()).toBe(401);
    await expect((await request.get('/api/mysql/events')).status()).toBe(401);
    await expect((await request.get('/api/mysql/shifts')).status()).toBe(401);
    await expect((await request.get('/api/mysql/alerts')).status()).toBe(401);
  });

  test('[readonly] denies invalid login', async ({ page }) => {
    await page.goto('/');
    await page.locator('input[type="email"]').fill('invalid-admin@example.com');
    await page.locator('input[placeholder="••••••••"]').first().fill('BADPASS');
    await page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i }).click();
    await expect(page.getByText(/Invalid credentials.|Credenciales no validas/i)).toBeVisible();
  });

  test('[readonly] navigates across core modules after login', async ({ page }) => {
    await loginWithAdmin(page);

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await expect(page.getByRole('button', { name: /Ingreso Manual de ID/i })).toBeVisible();

    await page.getByRole('button', { name: /Plantilla/i }).click();
    await expect(page.getByRole('heading', { name: /Plantilla de Personal/i })).toBeVisible();

    await page.getByRole('button', { name: /Historial Registros/i }).click();
    await expect(page.getByRole('heading', { name: /Historial de Registros/i })).toBeVisible();

    await page.getByRole('button', { name: /KPIs y Estadísticas/i }).click();
    await expect(page.getByRole('heading', { name: /KPIs y Estadísticas Operativas/i })).toBeVisible();
  });

  test('[readonly] shows validation error for invalid manual scanner id', async ({ page }) => {
    await loginWithAdmin(page);

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await page.getByRole('button', { name: /Ingreso Manual de ID/i }).click();
    await page.locator('input[placeholder*="SEC-042"]').fill('INVALID-XYZ');
    await page.getByRole('button', { name: /^ENVIAR$/i }).click();

    await expect(page.getByText(/ID o nombre inválido/i)).toBeVisible();
  });
});
