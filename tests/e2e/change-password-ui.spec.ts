import { expect, test, type Page, type Request } from '@playwright/test';

const passwordEndpoint = '/api/mysql/users/me/password';

async function openAuthenticatedApp(page: Page) {
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
  await page.route('**/api/auth/session', (route) => route.fulfill({
    json: { authenticated: true, role: 'viewer' },
  }));
  await page.route('**/api/auth/logout', (route) => route.fulfill({
    json: { success: true },
  }));
  await page.route('**/api/mysql/**', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
}

async function fillValidForm(page: Page) {
  await page.getByLabel('Contraseña actual').fill('CurrentPass123!');
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('NewPassword456!');
  await page.getByLabel('Confirmar nueva contraseña').fill('NewPassword456!');
}

test('sends the exact me/password contract and returns to login after success', async ({ page }) => {
  await openAuthenticatedApp(page);

  let passwordRequest: Request | null = null;
  await page.route(`**${passwordEndpoint}`, async (route) => {
    passwordRequest = route.request();
    await route.fulfill({
      status: 200,
      json: { success: true, message: 'Password updated. Please sign in again.' },
    });
  });

  await page.getByRole('button', { name: 'Cambiar contraseña' }).first().click();
  await fillValidForm(page);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();

  await expect(page.getByText('Contraseña actualizada. Vuelve a iniciar sesión.')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'TERMINAL DE ACCESO' })).toBeVisible();
  expect(passwordRequest).not.toBeNull();
  expect(passwordRequest!.method()).toBe('POST');
  expect(new URL(passwordRequest!.url()).pathname).toBe(passwordEndpoint);
  expect(passwordRequest!.postDataJSON()).toEqual({
    currentPassword: 'CurrentPass123!',
    newPassword: 'NewPassword456!',
  });
});

test('shows an inline error and keeps the session open when the current password is incorrect', async ({ page }) => {
  await openAuthenticatedApp(page);
  await page.route(`**${passwordEndpoint}`, (route) => route.fulfill({
    status: 401,
    json: { success: false, message: 'Current password is incorrect.' },
  }));

  await page.getByRole('button', { name: 'Cambiar contraseña' }).first().click();
  await fillValidForm(page);
  await page.getByRole('button', { name: 'Guardar contraseña' }).click();

  await expect(page.getByRole('alert')).toHaveText('La contraseña actual es incorrecta.');
  await expect(page.getByRole('dialog', { name: 'Cambiar contraseña' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'TERMINAL DE ACCESO' })).toHaveCount(0);
});

test('does not request me/password when the new password is too short or confirmation differs', async ({ page }) => {
  await openAuthenticatedApp(page);

  let requestCount = 0;
  await page.route(`**${passwordEndpoint}`, (route) => {
    requestCount += 1;
    return route.fulfill({ status: 200, json: { success: true } });
  });

  await page.getByRole('button', { name: 'Cambiar contraseña' }).first().click();
  await page.getByLabel('Contraseña actual').fill('CurrentPass123!');
  await page.getByLabel('Nueva contraseña', { exact: true }).fill('short');
  await page.getByLabel('Confirmar nueva contraseña').fill('short');
  await expect(page.getByRole('button', { name: 'Guardar contraseña' })).toBeDisabled();

  await page.getByLabel('Nueva contraseña', { exact: true }).fill('NewPassword456!');
  await page.getByLabel('Confirmar nueva contraseña').fill('DifferentPass789!');
  await expect(page.getByRole('button', { name: 'Guardar contraseña' })).toBeDisabled();
  expect(requestCount).toBe(0);
});
