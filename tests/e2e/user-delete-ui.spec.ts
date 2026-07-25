import { expect, test, type Page, type Request } from '@playwright/test';
import { seedOnboardingSeen } from './helpers/onboarding';

const SESSION_EMAIL = 'admin.session@example.test';
const OTHER_USER = { id: 'user_viewer_1', email: 'viewer.test@example.test', role: 'viewer', status: 'inactive' };
const SELF_USER = { id: 'user_admin_self', email: SESSION_EMAIL, role: 'admin', status: 'active' };

async function openUsersScreen(page: Page) {
  // The session mock carries an email, so the onboarding flag must be seeded under that
  // same key or the welcome modal covers the screen (lesson from #119).
  await seedOnboardingSeen(page, { email: SESSION_EMAIL });
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
  await page.route('**/api/auth/session', (route) => route.fulfill({
    json: { authenticated: true, role: 'admin', email: SESSION_EMAIL },
  }));
  // Catch-all first; the specific routes below are registered later and win.
  await page.route('**/api/mysql/**', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/mysql/users', (route) => route.fulfill({
    json: { users: [SELF_USER, OTHER_USER] },
  }));
  await page.goto('/');
  await page.getByRole('button', { name: 'Usuarios' }).click();
  await expect(page.getByTestId('maintenance-card')).toBeVisible();
}

test('delete button is offered per user but never for your own account', async ({ page }) => {
  await openUsersScreen(page);

  await expect(page.getByTestId(`user-delete-${OTHER_USER.id}`)).toBeVisible();
  await expect(page.getByTestId(`user-delete-${SELF_USER.id}`)).toHaveCount(0);
  // Deactivate stays available for both rows — delete is additive, not a replacement.
  await expect(page.getByRole('button', { name: 'Desactivar' })).toBeVisible();
});

test('confirming sends exactly one DELETE to the user endpoint', async ({ page }) => {
  await openUsersScreen(page);

  const deleteRequests: Request[] = [];
  await page.route('**/api/mysql/users/*', async (route) => {
    deleteRequests.push(route.request());
    await route.fulfill({ status: 200, json: { success: true, id: OTHER_USER.id, email: OTHER_USER.email } });
  });

  await page.getByTestId(`user-delete-${OTHER_USER.id}`).click();
  await expect(page.getByTestId('user-delete-dialog')).toBeVisible();
  await expect(page.getByTestId('user-delete-dialog')).toContainText(OTHER_USER.email);

  await page.getByTestId('user-delete-confirm').click();
  await expect(page.getByTestId('user-delete-dialog')).toHaveCount(0);

  expect(deleteRequests).toHaveLength(1);
  expect(deleteRequests[0].method()).toBe('DELETE');
  expect(new URL(deleteRequests[0].url()).pathname).toBe(`/api/mysql/users/${OTHER_USER.id}`);
});

test('cancelling the dialog sends nothing', async ({ page }) => {
  await openUsersScreen(page);

  let calls = 0;
  await page.route('**/api/mysql/users/*', (route) => {
    calls += 1;
    return route.fulfill({ json: { success: true } });
  });

  await page.getByTestId(`user-delete-${OTHER_USER.id}`).click();
  await expect(page.getByTestId('user-delete-dialog')).toBeVisible();
  await page.getByRole('button', { name: 'Cancelar' }).click();
  await expect(page.getByTestId('user-delete-dialog')).toHaveCount(0);

  await page.waitForTimeout(150);
  expect(calls).toBe(0);
});
