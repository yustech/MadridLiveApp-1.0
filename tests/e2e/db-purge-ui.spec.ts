import { expect, test, type Page, type Request } from '@playwright/test';
import { seedOnboardingSeen } from './helpers/onboarding';

const purgeEndpoint = '/api/mysql/purge';

async function openAdminApp(page: Page) {
  await seedOnboardingSeen(page, { role: 'admin' });
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
  await page.route('**/api/auth/session', (route) => route.fulfill({
    json: { authenticated: true, role: 'admin' },
  }));
  // Catch-all first; the specific routes below are registered later and win.
  await page.route('**/api/mysql/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/mysql/users', (route) => route.fulfill({ json: { users: [] } }));
  await page.route('**/api/mysql/health-count', (route) => route.fulfill({
    json: { counts: { staff: 5, events: 2, shifts: 9, alerts: 1 } },
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Usuarios' }).click();
  await expect(page.getByTestId('maintenance-card')).toBeVisible();
}

test('purge dialog gates on VACIAR and sends the exact selected collections', async ({ page }) => {
  await openAdminApp(page);

  let purgeRequest: Request | null = null;
  await page.route(`**${purgeEndpoint}`, async (route) => {
    purgeRequest = route.request();
    await route.fulfill({
      status: 200,
      json: { success: true, deleted: { shifts: 9, alerts: 1 }, tables: ['shifts', 'alerts'], message: 'Base de datos vaciada.' },
    });
  });

  await page.getByTestId('purge-open').click();
  await expect(page.getByTestId('purge-dialog')).toBeVisible();

  // Disabled with nothing selected and no confirmation word.
  await expect(page.getByTestId('purge-submit')).toBeDisabled();

  await page.getByTestId('purge-collection-shifts').check();
  await page.getByTestId('purge-collection-alerts').check();
  // Still disabled until the confirmation word is typed exactly.
  await expect(page.getByTestId('purge-submit')).toBeDisabled();

  await page.getByTestId('purge-confirm-input').fill('VACIAR');
  await expect(page.getByTestId('purge-submit')).toBeEnabled();
  await page.getByTestId('purge-submit').click();

  await expect(page.getByText(/Base de datos vaciada/)).toBeVisible();
  expect(purgeRequest).not.toBeNull();
  expect(purgeRequest!.method()).toBe('POST');
  expect(new URL(purgeRequest!.url()).pathname).toBe(purgeEndpoint);
  expect(purgeRequest!.postDataJSON()).toEqual({ collections: ['shifts', 'alerts'] });
});

test('purge dialog never offers users and sends nothing without the confirmation word', async ({ page }) => {
  await openAdminApp(page);

  let purgeCalls = 0;
  await page.route(`**${purgeEndpoint}`, (route) => {
    purgeCalls += 1;
    return route.fulfill({ json: { success: true, deleted: {}, tables: [] } });
  });

  await page.getByTestId('purge-open').click();
  await expect(page.getByTestId('purge-collection-staff')).toBeVisible();
  await expect(page.getByTestId('purge-collection-users')).toHaveCount(0);
  await expect(page.getByTestId('purge-collection-schema_migrations')).toHaveCount(0);

  // Selected, but the confirmation word is wrong (lowercase) -> stays disabled.
  await page.getByTestId('purge-collection-staff').check();
  await page.getByTestId('purge-confirm-input').fill('vaciar');
  await expect(page.getByTestId('purge-submit')).toBeDisabled();

  await page.waitForTimeout(150);
  expect(purgeCalls).toBe(0);
});
