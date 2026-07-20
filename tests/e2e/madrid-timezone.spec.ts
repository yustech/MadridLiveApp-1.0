import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'UTC' });

const worker = {
  id: 'usr-madrid-time-e2e',
  idCode: 'MADRID-TZ-001',
  name: 'Clara Horaria',
  role: 'Auxiliar' as const,
  roleLabel: 'Auxiliar',
  status: 'IN' as const,
  checkedInTime: '2026-07-18T22:30:00.000Z',
  lastSeen: '2026-07-18T22:30:00.000Z',
  avatar: '',
  email: 'clara@example.com',
  phone: '+34 600 000 027',
  totalHours: 1,
  currentShiftHours: 0,
  currentShiftMins: 15,
};

const event = {
  id: 'event-madrid-time-e2e',
  title: 'Concierto horario Madrid',
  location: 'Sala UTC Browser',
  dateDay: '19',
  dateMonth: 'JUL',
  dateYear: '2026',
  doorsOpen: '23:00',
  requiredStaff: 1,
  activeStaff: 1,
  totalStaffNeeded: 1,
  scanRate: 1,
  loadInPercent: 100,
};

const shift = {
  id: 'shift-madrid-time-e2e',
  workerId: worker.id,
  dateString: 'legacy incorrect date',
  timespan: '22:30 - Present',
  durationLabel: 'Active',
  eventId: event.id,
  eventTitle: event.title,
  status: 'Active' as const,
  startedAt: worker.checkedInTime,
  endedAt: null,
  updatedAt: '2026-07-18T22:30:00.000Z',
};

async function mockTemporalData(page: Page) {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/mysql/events', (route) => route.fulfill({ json: [event] }));
  await page.route('**/api/mysql/staff', (route) => route.fulfill({ json: [worker] }));
  await page.route('**/api/mysql/shifts', (route) => route.fulfill({ json: [shift] }));
  await page.route('**/api/mysql/alerts', (route) => route.fulfill({ json: [] }));
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
}

test('shows one UTC instant consistently as Madrid across operational screens and CSV', async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-07-18T22:45:00.000Z'));
  await mockTemporalData(page);

  const dataRequests: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/mysql\/(staff|events|shifts)$/.test(new URL(request.url()).pathname)) {
      dataRequests.push(`${request.method()} ${new URL(request.url()).pathname}`);
    }
  });

  await page.goto('/');
  await page.getByRole('button', { name: /^Plantilla$/i }).click();
  await expect(page.getByText('Entrada: 19/07/2026, 00:30')).toBeVisible();

  await page.getByRole('heading', { name: worker.name }).click();
  await expect(page.locator('#profile-view')).toContainText('00:30 - Presente');
  await expect(page.locator('#profile-view')).toContainText(/Hoy · 19 jul/i);

  await page.getByRole('button', { name: /Historial Registros/i }).click();
  await expect(page.getByTestId(`shift-time-range-${shift.id}`)).toHaveText('00:30 - Presente');
  await page.getByRole('button', { name: worker.name }).first().click();
  await expect(page.getByTestId('shift-detail-time-range')).toHaveText('00:30 CEST - Presente');
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exportar en CSV/i }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('registros_personal_2026-07-19.csv');
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const csv = await readFile(downloadPath!, 'utf8');
  expect(csv).toContain('19 jul 2026');
  expect(csv).toContain('00:30 CEST - Presente');

  await page.getByRole('button', { name: /Lector QR/i }).click();
  await expect(page.getByTestId('scanner-check-in-time')).toHaveText('Entrada: 19/07/2026, 00:30');
  await expect(page.getByText('Apertura de Puertas: 23:00 hs')).toBeVisible();

  await page.getByRole('button', { name: /KPIs y Estadísticas/i }).click();
  await expect(page.locator('#kpis-and-analytics-dashboard')).toContainText('00:00 CEST');

  expect(dataRequests).toEqual(expect.arrayContaining([
    'GET /api/mysql/staff',
    'GET /api/mysql/events',
    'GET /api/mysql/shifts',
  ]));
});
