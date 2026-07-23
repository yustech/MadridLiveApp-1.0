import { expect, test, type Page } from '@playwright/test';
import { seedOnboardingSeen } from './helpers/onboarding';

type MockRole = 'admin' | 'viewer';

async function openAuthenticatedApp(
  page: Page,
  role: MockRole,
  writeRequests: string[],
) {
  page.on('request', (request) => {
    if (request.method() !== 'GET') {
      writeRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
  await page.route('**/api/auth/session', (route) => (
    route.fulfill({ json: { authenticated: true, role } })
  ));
  await page.route('**/api/mysql/**', (route) => {
    return route.fulfill({ json: [] });
  });
  await page.goto('/');
}

test('viewer dismisses onboarding and it stays dismissed after reload', async ({ page }) => {
  const writeRequests: string[] = [];
  await openAuthenticatedApp(page, 'viewer', writeRequests);

  const dialog = page.getByRole('dialog', { name: 'Bienvenido a MadridLive Access' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(
    'Entra y navega — lo ves todo en tiempo real, sin riesgo de tocar nada.',
    { exact: true },
  )).toBeVisible();

  await dialog.getByRole('button', { name: 'Entendido', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem('ml-onboarding-seen:viewer'))).toBe('1');

  await page.reload();
  await expect(dialog).toHaveCount(0);
  expect(writeRequests).toEqual([]);
});

test('admin onboarding shows the exact role-specific guidance', async ({ page }) => {
  const writeRequests: string[] = [];
  await openAuthenticatedApp(page, 'admin', writeRequests);

  const dialog = page.getByRole('dialog', { name: 'Bienvenido a MadridLive Access' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText(
    'Al cierre: Historial sin turnos huérfanos, KPIs Histórico y CSV',
    { exact: true },
  )).toBeVisible();
  expect(writeRequests).toEqual([]);
});

test('pre-seeded onboarding stays closed but quick guide always reopens it', async ({ page }) => {
  const writeRequests: string[] = [];
  await seedOnboardingSeen(page, { role: 'viewer' });
  await openAuthenticatedApp(page, 'viewer', writeRequests);

  const dialog = page.getByRole('dialog', { name: 'Bienvenido a MadridLive Access' });
  await expect(dialog).toHaveCount(0);

  await page.getByRole('button', { name: 'GUÍA RÁPIDA', exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(writeRequests).toEqual([]);
});
