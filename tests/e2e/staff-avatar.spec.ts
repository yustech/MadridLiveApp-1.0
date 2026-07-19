import { expect, test } from '@playwright/test';

const customAvatarUrl = 'https://avatar.test/custom-worker.svg';
const brokenAvatarUrl = 'https://avatar.test/broken-worker.jpg';

const staff = [
  {
    id: 'worker-empty-avatar',
    idCode: 'AVATAR-001',
    name: 'Miguel Ángel Robles Álvarez',
    role: 'Auxiliar',
    roleLabel: 'Auxiliar',
    status: 'OUT',
    avatar: '',
    email: '',
    phone: '',
    rating: null,
    totalHours: 0,
    currentShiftHours: 0,
    currentShiftMins: 0,
  },
  {
    id: 'worker-custom-avatar',
    idCode: 'AVATAR-002',
    name: 'Avatar Personalizado',
    role: 'Auxiliar',
    roleLabel: 'Auxiliar',
    status: 'OUT',
    avatar: customAvatarUrl,
    email: '',
    phone: '',
    rating: null,
    totalHours: 0,
    currentShiftHours: 0,
    currentShiftMins: 0,
  },
  {
    id: 'worker-broken-avatar',
    idCode: 'AVATAR-003',
    name: 'Persona Fallida',
    role: 'Auxiliar',
    roleLabel: 'Auxiliar',
    status: 'OUT',
    avatar: brokenAvatarUrl,
    email: '',
    phone: '',
    rating: null,
    totalHours: 0,
    currentShiftHours: 0,
    currentShiftMins: 0,
  },
] as const;

test('renders initials without rewriting custom avatars and falls back on image errors', async ({ page }) => {
  const staffRequests: Array<{ method: string; pathname: string }> = [];

  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route(customAvatarUrl, (route) => route.fulfill({
    contentType: 'image/svg+xml',
    body: '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="navy"/></svg>',
  }));
  await page.route(brokenAvatarUrl, (route) => route.fulfill({ status: 404, body: 'not found' }));
  await page.route('**/api/mysql/staff', (route) => {
    staffRequests.push({
      method: route.request().method(),
      pathname: new URL(route.request().url()).pathname,
    });
    return route.fulfill({ json: staff });
  });
  await page.route('**/api/mysql/staff/**', (route) => {
    staffRequests.push({
      method: route.request().method(),
      pathname: new URL(route.request().url()).pathname,
    });
    return route.fulfill({ status: 500, json: { message: 'Unexpected staff mutation' } });
  });
  await page.route(/\/api\/mysql\/(events|shifts|alerts)$/, (route) => route.fulfill({ json: [] }));
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));

  await page.goto('/');
  await page.getByRole('button', { name: /^Plantilla$/i }).click();

  const emptyAvatar = page.getByTestId('staff-avatar-worker-empty-avatar');
  await expect(emptyAvatar).toHaveAttribute('data-avatar-kind', 'initials');
  await expect(emptyAvatar).toHaveText('MA');

  const customAvatar = page.getByTestId('staff-avatar-worker-custom-avatar');
  await expect(customAvatar).toHaveAttribute('data-avatar-kind', 'custom');
  await expect(customAvatar).toHaveAttribute('src', customAvatarUrl);

  const brokenAvatar = page.getByTestId('staff-avatar-worker-broken-avatar');
  await expect(brokenAvatar).toHaveAttribute('data-avatar-kind', 'initials');
  await expect(brokenAvatar).toHaveText('PF');

  expect(staff[0].avatar).toBe('');
  expect(staff[1].avatar).toBe(customAvatarUrl);
  expect(staff[2].avatar).toBe(brokenAvatarUrl);
  expect(staffRequests.length).toBeGreaterThan(0);
  expect(staffRequests.every((request) => request.method === 'GET' && request.pathname === '/api/mysql/staff')).toBe(true);
});
