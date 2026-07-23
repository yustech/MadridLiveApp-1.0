import { readFile } from 'node:fs/promises';
import { expect, test, type Page } from '@playwright/test';
import { seedOnboardingSeen } from './helpers/onboarding';

const event = {
  id: 'event-duration-e2e',
  title: 'Concierto duración exacta',
  location: 'Sala Duración',
  dateDay: '19',
  dateMonth: 'JUL',
  dateYear: '2026',
  doorsOpen: '19:00',
  requiredStaff: 1,
  assignedStaffCount: 1,
  activeStaff: 0,
  totalStaffNeeded: 1,
  scanRate: 0,
  loadInPercent: 100,
};

const worker = {
  id: 'worker-duration-e2e',
  idCode: 'DURATION-001',
  name: 'Duración Canónica',
  role: 'Auxiliar' as const,
  roleLabel: 'Auxiliar',
  status: 'OUT' as const,
  avatar: '',
  email: '',
  phone: '',
  rating: null,
  totalHours: 0,
  currentShiftHours: 0,
  currentShiftMins: 0,
};

const shifts = [
  {
    id: 'shift-duration-21433',
    workerId: worker.id,
    dateString: '2026-07-19',
    timespan: '12:00 - 14:14',
    durationLabel: '2.2h',
    eventId: event.id,
    eventTitle: event.title,
    status: 'Completed' as const,
    startedAt: '2026-07-19T10:00:00.000Z',
    endedAt: '2026-07-19T12:14:33.000Z',
  },
  {
    id: 'shift-duration-21529',
    workerId: worker.id,
    dateString: '2026-07-19',
    timespan: '15:00 - 17:15',
    durationLabel: '9.9h',
    eventId: event.id,
    eventTitle: event.title,
    status: 'Completed' as const,
    startedAt: '2026-07-19T13:00:00.000Z',
    endedAt: '2026-07-19T15:15:29.000Z',
  },
];

async function mockDurationData(page: Page) {
  await seedOnboardingSeen(page, { role: 'admin' });
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/mysql/events', (route) => route.fulfill({ json: [event] }));
  await page.route('**/api/mysql/staff', (route) => route.fulfill({ json: [worker] }));
  await page.route('**/api/mysql/shifts', (route) => route.fulfill({ json: shifts }));
  await page.route('**/api/mysql/alerts', (route) => route.fulfill({ json: [] }));
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
}

test('renders and exports canonical completed-shift durations and averages exact minutes', async ({ page }) => {
  await mockDurationData(page);
  await page.goto('/');
  await page.getByRole('button', { name: /Historial Registros/i }).click();

  await expect(page.getByText('2h 15m', { exact: true })).toHaveCount(4);
  await expect(page.getByText('Horas Acumuladas', { exact: true }).locator('..')).toContainText('4h 30m');

  await page.getByRole('button', { name: worker.name }).first().click();
  await expect(page.getByText('2h 15m · Completado', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Cerrar', exact: true }).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: /Exportar en CSV/i }).click();
  const download = await downloadPromise;
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const csv = await readFile(downloadPath!, 'utf8');
  expect(csv.match(/"2h 15m"/g)).toHaveLength(2);
  expect(csv).not.toContain('2.2h');
  expect(csv).not.toContain('9.9h');

  await page.getByRole('button', { name: /KPIs y Estadísticas/i }).first().click();
  await expect(page.getByText('Promedio de turno completado: 2h 15m')).toBeVisible();
});
