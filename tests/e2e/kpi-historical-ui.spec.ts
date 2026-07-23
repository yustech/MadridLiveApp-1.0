import { expect, test, type Page } from '@playwright/test';
import { seedOnboardingSeen } from './helpers/onboarding';

const historicalEvent = {
  id: 'event-kpi-history',
  title: 'Evento Histórico E2E',
  location: 'Madrid',
  dateDay: '20',
  dateMonth: 'JUL',
  dateYear: '2026',
  doorsOpen: '18:00',
  requiredStaff: 4,
  activeStaff: 0,
  totalStaffNeeded: 4,
  scanRate: 0,
  loadInPercent: 100,
};

const workers = [
  { id: 'history-a', idCode: 'H-A', name: 'Ana Histórica', role: 'Auxiliar', roleLabel: 'Auxiliar', status: 'OUT', avatar: '', totalHours: 99, currentShiftHours: 0, currentShiftMins: 0 },
  { id: 'history-b', idCode: 'H-B', name: 'Berta Histórica', role: 'Coordinación', roleLabel: 'Coordinación', status: 'OUT', avatar: '', totalHours: 99, currentShiftHours: 0, currentShiftMins: 0 },
];

const completedShifts = [
  { id: 'history-s1', workerId: 'history-a', dateString: '2026-07-20', timespan: '10:00 - 12:12', durationLabel: '2.2h', eventId: historicalEvent.id, eventTitle: historicalEvent.title, status: 'Completed', startedAt: '2026-07-20T08:00:00Z', endedAt: '2026-07-20T10:12:00Z' },
  { id: 'history-s2', workerId: 'history-a', dateString: '2026-07-20', timespan: '13:00 - 15:13', durationLabel: '2.2h', eventId: historicalEvent.id, eventTitle: historicalEvent.title, status: 'Completed', startedAt: '2026-07-20T11:00:00Z', endedAt: '2026-07-20T13:13:00Z' },
  { id: 'history-s3', workerId: 'history-b', dateString: '2026-07-20', timespan: '16:00 - 17:00', durationLabel: '1.0h', eventId: historicalEvent.id, eventTitle: historicalEvent.title, status: 'Completed', startedAt: '2026-07-20T14:00:00Z', endedAt: '2026-07-20T15:00:00Z' },
];

async function mockHistoricalData(page: Page) {
  await seedOnboardingSeen(page, { role: 'admin' });
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/mysql/events', (route) => route.fulfill({ json: [historicalEvent] }));
  await page.route('**/api/mysql/staff', (route) => route.fulfill({ json: workers }));
  await page.route('**/api/mysql/shifts', (route) => route.fulfill({ json: completedShifts }));
  await page.route('**/api/mysql/alerts', (route) => route.fulfill({ json: [] }));
}

test('switches from zero live activity to exact completed-event historical KPIs', async ({ page }) => {
  await mockHistoricalData(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'KPIs y Estadísticas' }).first().click();
  await page.getByRole('combobox').selectOption(historicalEvent.id);

  // exact: true so the label span is matched, not the tile wrapper whose text also contains it.
  const liveActiveShifts = page.getByText('Turnos Activos Ahora', { exact: true });
  await expect(liveActiveShifts).toBeVisible();
  await expect(liveActiveShifts.locator('..')).toContainText('0');

  await page.getByRole('button', { name: 'Histórico' }).click();
  await expect(page.getByTestId('historical-trabajadores-únicos')).toHaveText('2');
  await expect(page.getByTestId('historical-horas-totales')).toHaveText('5h 25m');
  await expect(page.getByText('1. Ana Histórica', { exact: true })).toBeVisible();
  await expect(page.getByText('4h 25m', { exact: true })).toBeVisible();
  await expect(page.getByText('Media de fichajes/min · últimos 5 min')).toHaveCount(0);
  await expect(page.getByText('Altas de turno en 60 min')).toHaveCount(0);
});
