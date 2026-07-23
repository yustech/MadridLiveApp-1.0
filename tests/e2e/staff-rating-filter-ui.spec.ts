import { expect, test, type Page } from '@playwright/test';
import { seedOnboardingSeen } from './helpers/onboarding';

const workers = [
  { id: 'rating-5', name: 'Cinco Estrellas', rating: 5 },
  { id: 'rating-4', name: 'Cuatro Estrellas', rating: 4 },
  { id: 'rating-3', name: 'Tres Estrellas', rating: 3 },
  { id: 'rating-null-z', name: 'Zeta Sin Puntuar', rating: null },
  { id: 'rating-null-a', name: 'Ana Sin Puntuar', rating: null },
].map((worker) => ({
  ...worker,
  idCode: worker.id.toUpperCase(),
  role: 'Auxiliar' as const,
  roleLabel: 'Auxiliar',
  status: 'OUT' as const,
  avatar: '',
  email: `${worker.id}@example.com`,
  phone: '+34 600 000 000',
  totalHours: 0,
  currentShiftHours: 0,
  currentShiftMins: 0,
}));

async function mockReadonlyData(page: Page, writeRequests: string[]) {
  await seedOnboardingSeen(page, { role: 'viewer' });
  await page.route('**/api/auth/session', (route) => (
    route.fulfill({ json: { authenticated: true, role: 'viewer' } })
  ));
  await page.route('**/api/mysql/**', (route) => {
    const request = route.request();
    const pathname = new URL(request.url()).pathname;

    if (request.method() !== 'GET') writeRequests.push(`${request.method()} ${pathname}`);
    if (pathname === '/api/mysql/staff') return route.fulfill({ json: workers });
    return route.fulfill({ json: [] });
  });
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
}

test('filters and orders staff by rating without issuing writes', async ({ page }) => {
  const writeRequests: string[] = [];
  await mockReadonlyData(page, writeRequests);
  await page.goto('/');
  await page.getByRole('button', { name: 'Plantilla', exact: true }).first().click();
  await expect(page.getByRole('heading', { name: 'Plantilla de Personal', exact: true })).toBeVisible();

  const cards = page.locator('[data-testid^="staff-card-rating-"]');
  const ratingFilter = page.getByLabel('Puntuación', { exact: true });

  await expect(cards).toHaveCount(5);

  await ratingFilter.selectOption({ label: '4★ o más' });
  await expect(cards).toHaveCount(2);
  await expect(page.getByText('Cinco Estrellas', { exact: true })).toBeVisible();
  await expect(page.getByText('Cuatro Estrellas', { exact: true })).toBeVisible();
  await expect(page.getByText('Tres Estrellas', { exact: true })).toHaveCount(0);

  await ratingFilter.selectOption({ label: 'Sin puntuar' });
  await expect(cards).toHaveCount(2);
  await expect(page.getByText('Ana Sin Puntuar', { exact: true })).toBeVisible();
  await expect(page.getByText('Zeta Sin Puntuar', { exact: true })).toBeVisible();

  await ratingFilter.selectOption({ label: 'Todas' });
  await expect(cards).toHaveCount(5);

  await page.locator('select').filter({ has: page.locator('option[value="RatingDesc"]') }).selectOption('RatingDesc');
  await expect(cards).toHaveCount(5);
  expect(await cards.evaluateAll((elements) => elements.map((element) => element.getAttribute('data-testid')))).toEqual([
    'staff-card-rating-rating-5',
    'staff-card-rating-rating-4',
    'staff-card-rating-rating-3',
    'staff-card-rating-rating-null-a',
    'staff-card-rating-rating-null-z',
  ]);

  expect(writeRequests).toEqual([]);
});
