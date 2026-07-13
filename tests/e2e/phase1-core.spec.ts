import { expect, test } from '@playwright/test';

const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD || '';

function isMysqlUnconfiguredMessage(payload: string) {
  return payload.toLowerCase().includes('mysql is not configured');
}

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

test.describe('Phase 1 - core functional flows', () => {
  test('[readonly] login, lock terminal, and login again', async ({ page }) => {
    await loginWithAdmin(page);

    await page.getByRole('button', { name: /BLOQUEAR TERMINAL/i }).click();
    await expect(page.getByText(/TERMINAL DE ACCESO/i)).toBeVisible();

    await loginWithAdmin(page);
    await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();
  });

  test('[readonly] core navigation modules render stable anchors', async ({ page }) => {
    await loginWithAdmin(page);

    await page.getByRole('button', { name: /Plantilla/i }).click();
    await expect(page.getByRole('heading', { name: /Plantilla de Personal/i })).toBeVisible();

    await page.getByRole('button', { name: /Historial Registros/i }).click();
    await expect(page.getByText(/Historial de Registros/i)).toBeVisible();

    await page.getByRole('button', { name: /KPIs y Estadísticas/i }).click();
    await expect(page.getByText(/Métricas & KPIs/i)).toBeVisible();

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await expect(page.getByText(/Punto de Registro QR Activo/i)).toBeVisible();
  });

  test('[readonly] opens profile from header avatar and returns to staff', async ({ page, request }) => {
    const mysqlHealthResponse = await request.get('/api/mysql/health-count');
    const mysqlHealthJson = await mysqlHealthResponse.json().catch(() => null);
    const mysqlHealthPayload = String((mysqlHealthJson as { message?: string; error?: string } | null)?.message || (mysqlHealthJson as { message?: string; error?: string } | null)?.error || '');

    test.skip(
      mysqlHealthResponse.status() === 503 && isMysqlUnconfiguredMessage(mysqlHealthPayload),
      'MySQL is not configured in this runner; skipping profile-navigation check that depends on roster data.'
    );

    await loginWithAdmin(page);

    await page.getByTitle(/Ver perfil de Javier Rodríguez/i).click();
    await expect(page.getByRole('heading', { name: /Perfil del Colaborador/i })).toBeVisible();

    await page.locator('#profile-view button').first().click();
    await expect(page.getByRole('heading', { name: /Plantilla de Personal/i })).toBeVisible();
  });

  test('[readonly] scanner manual entry rejects unknown ids', async ({ page }) => {
    await loginWithAdmin(page);

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await page.getByRole('button', { name: /Ingreso Manual de ID/i }).click();
    await page.locator('input[placeholder*="SEC-042"]').fill('PHASE1-INVALID-ID');
    await page.getByRole('button', { name: /^ENVIAR$/i }).click();

    await expect(page.getByText(/ID o nombre inválido/i)).toBeVisible();
  });
});
