import { expect, test, type Page } from '@playwright/test';

const removedStockAvatar = 'https://lh3.googleusercontent.com/aida-public/AB6AXuDC_NElRUlTxk860ETAyeeMiDTpE8tBnFJ74xyp5-NRSBtYQsm_svmfkP7nLHyou6LwqDDzexrIJOSrwP7u_TJAsGXcL7Y7g9_wRVSysXuccSJczUOeU1Bp6zRYPh5YwIZdeopltCYPGmjijbfp53H5q9azOxk2jsIoMeiBHgkbClhgty1nM1cLQjldyegOMlpM9A-qZ7MXP5bNiJBBYY8N3lOwZSmVbaUMtpcoeH5313BXoiLxOrNHhn_4x9ffMlsS6O5nGHBVhA4';

async function openWithSession(page: Page, session: { authenticated: true; role: 'admin'; email?: string }) {
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: session }));
  await page.route('**/api/mysql/**', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
}

test('shows the real session email and role without demo profile remnants', async ({ page }) => {
  await openWithSession(page, { authenticated: true, role: 'admin', email: 'x@y.z' });

  const card = page.getByTestId('session-user-card');
  await expect(card).toContainText('x@y.z');
  await expect(card).toContainText('Admin');
  await expect(card).toContainText('X');
  await expect(page.locator(`img[src="${removedStockAvatar}"]`)).toHaveCount(0);
  await expect(page.getByText('Javier R.', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Supervisor', { exact: true })).toHaveCount(0);
});

test('degrades to role and fallback initials when session email is absent', async ({ page }) => {
  await openWithSession(page, { authenticated: true, role: 'admin' });

  const card = page.getByTestId('session-user-card');
  await expect(card).toContainText('Admin');
  await expect(card).toContainText('?');
  await expect(card).not.toContainText('@');
});
