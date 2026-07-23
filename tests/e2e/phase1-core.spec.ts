import { expect, test } from '@playwright/test';
import { seedOnboardingSeen } from './helpers/onboarding';

const VIEWER_EMAIL = process.env.PLAYWRIGHT_VIEWER_EMAIL || '';
const VIEWER_PASSWORD = process.env.PLAYWRIGHT_VIEWER_PASSWORD || '';

function isMysqlUnconfiguredMessage(payload: string) {
  return payload.toLowerCase().includes('mysql is not configured');
}

async function loginWithViewer(page: import('@playwright/test').Page) {
  test.skip(!VIEWER_EMAIL || !VIEWER_PASSWORD, 'PLAYWRIGHT_VIEWER_EMAIL and PLAYWRIGHT_VIEWER_PASSWORD are required for readonly login UI tests.');

  await seedOnboardingSeen(page, { email: VIEWER_EMAIL, role: 'viewer' });
  await page.goto('/');

  const alreadyInside = await page.getByRole('button', { name: /Eventos \/ Control/i }).isVisible().catch(() => false);
  if (alreadyInside) return;

  await page.locator('input[type="email"]').fill(VIEWER_EMAIL);
  await page.locator('input[type="password"]').fill(VIEWER_PASSWORD);
  await page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i }).click();
  await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();
}

test.describe('Phase 1 - core functional flows', () => {
  test('[readonly] login, lock terminal, and login again', async ({ page }) => {
    await loginWithViewer(page);

    await page.getByRole('button', { name: /BLOQUEAR TERMINAL/i }).click();
    await expect(page.getByText(/TERMINAL DE ACCESO/i)).toBeVisible();

    await loginWithViewer(page);
    await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();
  });

  test('[readonly] core navigation modules render stable anchors', async ({ page }) => {
    await loginWithViewer(page);

    await page.getByRole('button', { name: /Plantilla/i }).click();
    await expect(page.getByRole('heading', { name: /Plantilla de Personal/i })).toBeVisible();

    await page.getByRole('button', { name: /Historial Registros/i }).click();
    await expect(page.getByText(/Historial de Registros/i)).toBeVisible();

    await page.getByRole('button', { name: /KPIs y Estadísticas/i }).click();
    await expect(page.getByText(/Métricas & KPIs/i)).toBeVisible();

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await expect(page.getByText(/Punto de Registro QR Activo/i)).toBeVisible();
  });

  test('[readonly] opens profile from a staff card and returns to staff', async ({ page, request }) => {
    const mysqlHealthResponse = await request.get('/api/mysql/health-count');
    const mysqlHealthJson = await mysqlHealthResponse.json().catch(() => null);
    const mysqlHealthPayload = String((mysqlHealthJson as { message?: string; error?: string } | null)?.message || (mysqlHealthJson as { message?: string; error?: string } | null)?.error || '');

    test.skip(
      mysqlHealthResponse.status() === 503 && isMysqlUnconfiguredMessage(mysqlHealthPayload),
      'MySQL is not configured in this runner; skipping profile-navigation check that depends on roster data.'
    );

    await loginWithViewer(page);

    await page.getByRole('button', { name: /Plantilla/i }).click();
    await page.locator('[data-testid^="staff-card-rating-"]').first().click();
    await expect(page.getByRole('heading', { name: /Perfil del Colaborador/i })).toBeVisible();

    await page.locator('#profile-view button').first().click();
    await expect(page.getByRole('heading', { name: /Plantilla de Personal/i })).toBeVisible();
  });

  test('[readonly] scanner manual entry is disabled for viewer', async ({ page }) => {
    await loginWithViewer(page);

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await expect(page.getByRole('button', { name: 'SOLO LECTURA' })).toBeDisabled();
  });
});
