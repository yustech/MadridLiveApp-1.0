import { expect, test, type Page } from '@playwright/test';

const madridParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
}).formatToParts(new Date());
const madridPart = (type: Intl.DateTimeFormatPartTypes) => (
  madridParts.find((part) => part.type === type)?.value || ''
);

const activeEvent = {
  id: 'event-metrics-a',
  title: 'Evento Métricas A',
  location: 'Sala A',
  dateDay: madridPart('day'),
  dateMonth: madridPart('month'),
  dateYear: madridPart('year'),
  doorsOpen: '19:00',
  requiredStaff: 2,
  assignedStaffCount: 1,
  activeStaff: 77,
  totalStaffNeeded: 2,
  scanRate: 99,
  loadInPercent: 0,
};

const simultaneousEvent = {
  ...activeEvent,
  id: 'event-metrics-b',
  title: 'Evento Métricas B',
  location: 'Sala B',
  requiredStaff: 1,
  assignedStaffCount: 1,
  totalStaffNeeded: 1,
};

const worker = (id: string, name: string) => ({
  id,
  idCode: id.toUpperCase(),
  name,
  role: 'Auxiliar' as const,
  roleLabel: 'Auxiliar',
  status: 'IN' as const,
  checkedInTime: new Date(Date.now() - 60_000).toISOString(),
  avatar: '',
  email: `${id}@example.com`,
  phone: '+34 600 000 000',
  totalHours: 0,
  currentShiftHours: 0,
  currentShiftMins: 1,
});

const workerA = worker('worker-metrics-a', 'Trabajador Métricas A');
const workerB = worker('worker-metrics-b', 'Trabajador Métricas B');

const recentStartedAt = new Date(Date.now() - 60_000).toISOString();
const dateString = `${activeEvent.dateYear}-${activeEvent.dateMonth}-${activeEvent.dateDay}`;
const shifts = [
  {
    id: 'shift-metrics-a',
    workerId: workerA.id,
    dateString,
    timespan: '19:00 - Present',
    durationLabel: 'Active',
    eventId: activeEvent.id,
    eventTitle: activeEvent.title,
    status: 'Active',
    startedAt: recentStartedAt,
  },
  {
    id: 'shift-metrics-b',
    workerId: workerB.id,
    dateString,
    timespan: '19:00 - Present',
    durationLabel: 'Active',
    eventId: simultaneousEvent.id,
    eventTitle: simultaneousEvent.title,
    status: 'Active',
    startedAt: recentStartedAt,
  },
];

async function mockMetricsData(page: Page, requests: Array<{ method: string; pathname: string }>) {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/mysql/events', (route) => {
    requests.push({ method: route.request().method(), pathname: new URL(route.request().url()).pathname });
    return route.fulfill({ json: [activeEvent, simultaneousEvent] });
  });
  await page.route('**/api/mysql/staff', (route) => route.fulfill({ json: [workerA, workerB] }));
  await page.route('**/api/mysql/shifts', (route) => {
    requests.push({ method: route.request().method(), pathname: new URL(route.request().url()).pathname });
    return route.fulfill({ json: shifts });
  });
  await page.route('**/api/mysql/alerts', (route) => route.fulfill({ json: [] }));
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
}

test('shows canonical operational metrics without exposing technical load-in progress', async ({ page }) => {
  const requests: Array<{ method: string; pathname: string }> = [];
  await mockMetricsData(page, requests);
  await page.goto('/');

  await expect(page.getByTestId('dashboard-personal-now')).toContainText('1 / 2');
  await expect(page.getByTestId('dashboard-checkin-rate')).toContainText('0.2');
  await expect(page.getByTestId('dashboard-checkin-rate')).toContainText('1 fichajes en 5 min');
  await expect(page.getByText('Estado del Montaje')).toHaveCount(0);

  await page.getByRole('heading', { name: activeEvent.title, exact: true }).click();
  await expect(page.getByText('Detalles del Despliegue')).toBeVisible();
  await expect(page.getByText('Avance del Montaje')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cerrar Ventana' }).click();

  await page.getByRole('button', { name: 'EXPLORADOR BD' }).click();
  const databaseManager = page.locator('#database-manager-screen');
  await databaseManager.getByRole('button', { name: /Eventos/ }).click();
  await expect(databaseManager).toContainText('Personal Requerido: 2 | Escaneos: 99 /min');
  await expect(databaseManager.getByText(/Montaje:/)).toHaveCount(0);
  await databaseManager.getByRole('button', { name: 'Editar' }).first().click();
  await expect(databaseManager.getByText('Progreso %', { exact: true })).toBeVisible();
  await databaseManager.locator('.fixed.inset-0.z-50').getByRole('button').first().click();
  await databaseManager.getByRole('button').nth(1).click();

  await page.getByRole('button', { name: 'Solo déficit' }).click();
  await expect(page.getByText('No hay conciertos con déficit de personal para el filtro activo.')).toBeVisible();
  await page.getByRole('button', { name: 'Ver todos' }).click();
  await expect(page.getByText(simultaneousEvent.title, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'KPIs y Estadísticas' }).first().click();
  await expect(page.getByTestId('kpi-checkin-rate')).toContainText('0.2');
  await expect(page.getByTestId('kpi-checkin-rate')).toContainText('1 fichajes en 5 min');

  await page.getByRole('combobox').selectOption('all');
  await expect(page.getByTestId('kpi-checkin-rate')).toContainText('0.4');
  await expect(page.getByTestId('kpi-checkin-rate')).toContainText('2 fichajes en 5 min');

  expect(requests).toEqual(expect.arrayContaining([
    { method: 'GET', pathname: '/api/mysql/events' },
    { method: 'GET', pathname: '/api/mysql/shifts' },
  ]));
});
