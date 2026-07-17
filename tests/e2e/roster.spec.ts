import { expect, test } from '@playwright/test';

const worker = {
  id: 'usr_roster_e2e',
  idCode: 'E2E-001',
  name: 'Ángela Muñoz',
  role: 'Auxiliar',
  roleLabel: 'Auxiliar',
  status: 'OUT',
  avatar: '',
  email: 'angela@example.com',
  phone: '+34 600 111 222',
  totalHours: 0,
  currentShiftHours: 0,
  currentShiftMins: 0,
};

test('edits a roster field and verifies persistence through the API contract', async ({ page }) => {
  let persistedWorker = { ...worker };
  let receivedPatch: { method: string; url: string; payload: unknown } | null = null;

  await page.route('**/api/auth/session', async (route) => {
    await route.fulfill({ json: { authenticated: true } });
  });
  await page.route('**/api/mysql/staff/*', async (route) => {
    receivedPatch = {
      method: route.request().method(),
      url: route.request().url(),
      payload: route.request().postDataJSON(),
    };
    persistedWorker = { ...persistedWorker, ...(receivedPatch.payload as Partial<typeof worker>) };
    await route.fulfill({ json: { success: true } });
  });
  await page.route('**/api/mysql/staff', async (route) => {
    await route.fulfill({ json: [persistedWorker] });
  });
  await page.route(/\/api\/mysql\/(events|shifts|alerts)$/, async (route) => {
    await route.fulfill({ json: [] });
  });

  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();

  await page.getByRole('button', { name: /^Plantilla$/i }).click();
  await expect(page.getByRole('heading', { name: 'Plantilla de Personal' })).toBeVisible();
  await page.getByRole('button', { name: 'Editar plantilla' }).click();
  await expect(page.getByRole('heading', { name: 'Editar plantilla' })).toBeVisible();

  const row = page.getByTestId(`roster-row-${worker.id}`);
  await expect(row).toBeVisible();
  await row.getByTestId(`roster-cell-name-${worker.id}`).click();
  const editor = row.getByTestId(`roster-editor-name-${worker.id}`);
  await editor.fill('Ángela Muñoz Editada');
  await editor.press('Enter');
  await expect(row.getByText('Guardado', { exact: true })).toBeVisible();

  expect(receivedPatch).toEqual({
    method: 'PATCH',
    url: expect.stringContaining(`/api/mysql/staff/${worker.id}`),
    payload: { name: 'Ángela Muñoz Editada' },
  });

  await page.getByRole('button', { name: 'Volver a Plantilla de Personal' }).click();
  await page.getByRole('button', { name: 'Editar plantilla' }).click();
  await page.getByPlaceholder('Buscar por nombre, ID, email o teléfono...').fill(worker.idCode);
  await expect(page.getByTestId(`roster-cell-name-${worker.id}`)).toHaveText('Ángela Muñoz Editada');
});
