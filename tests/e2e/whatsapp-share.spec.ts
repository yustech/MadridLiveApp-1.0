import { expect, test, type Page } from '@playwright/test';

const workers = [
  {
    id: 'worker-whatsapp-valid',
    idCode: 'WA-001',
    name: 'Ángela WhatsApp',
    role: 'Auxiliar' as const,
    roleLabel: 'Auxiliar',
    status: 'OUT' as const,
    avatar: '',
    email: 'angela@example.com',
    phone: '602 618 048',
    rating: null,
    totalHours: 0,
    currentShiftHours: 0,
    currentShiftMins: 0,
  },
  {
    id: 'worker-whatsapp-missing',
    idCode: 'WA-002',
    name: 'Bruno Sin Teléfono',
    role: 'Auxiliar' as const,
    roleLabel: 'Auxiliar',
    status: 'OUT' as const,
    avatar: '',
    email: 'bruno@example.com',
    phone: '',
    rating: null,
    totalHours: 0,
    currentShiftHours: 0,
    currentShiftMins: 0,
  },
];

async function mockAppData(page: Page) {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/mysql/staff', (route) => route.fulfill({ json: workers }));
  await page.route(/\/api\/mysql\/(events|shifts|alerts)$/, (route) => route.fulfill({ json: [] }));
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
}

function expectDirectedShareUrl(href: string | null, workerIdCode: string) {
  expect(href).not.toBeNull();
  const url = new URL(href!);
  expect(`${url.origin}${url.pathname}`).toBe('https://api.whatsapp.com/send');
  expect(url.searchParams.get('phone')).toBe('34602618048');
  expect(url.searchParams.get('text')).toContain(workerIdCode);
}

test('directs QR shares to the worker phone and disables missing recipients', async ({ page }) => {
  await mockAppData(page);
  await page.goto('/');

  await page.getByRole('button', { name: /^Plantilla$/i }).click();
  await page.getByRole('heading', { name: workers[0].name, exact: true }).click();
  const profileShare = page.getByRole('link', { name: `Enviar QR por WhatsApp a ${workers[0].name}` });
  expectDirectedShareUrl(await profileShare.getAttribute('href'), workers[0].idCode);

  await page.getByRole('button', { name: /Lector QR/i }).first().click();
  const scannerShare = page.getByRole('link', { name: `Enviar QR por WhatsApp a ${workers[0].name}` });
  expectDirectedShareUrl(await scannerShare.getAttribute('href'), workers[0].idCode);

  await page.getByRole('button', { name: new RegExp(workers[1].name) }).click();
  await expect(page.getByRole('button', { name: `Sin teléfono registrado para ${workers[1].name}` })).toBeDisabled();
  await expect(page.locator('a[href^="https://api.whatsapp.com/send?text="]')).toHaveCount(0);

  await page.getByRole('button', { name: /^Plantilla$/i }).click();
  await page.getByRole('heading', { name: workers[1].name, exact: true }).click();
  await expect(page.getByRole('button', { name: `Sin teléfono registrado para ${workers[1].name}` })).toBeDisabled();
});
