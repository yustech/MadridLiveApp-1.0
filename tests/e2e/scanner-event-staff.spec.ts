import { expect, test, type Page } from '@playwright/test';

const madridDateParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Madrid',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
}).formatToParts(new Date());
const madridDatePart = (type: Intl.DateTimeFormatPartTypes) => (
  madridDateParts.find((part) => part.type === type)?.value || ''
);

const currentEvent = {
  id: 'evt-scanner-current',
  title: 'Concierto Scanner E2E',
  location: 'Sala Scanner',
  dateDay: madridDatePart('day'),
  dateMonth: madridDatePart('month'),
  dateYear: madridDatePart('year'),
  doorsOpen: '19:00',
  requiredStaff: 3,
  activeStaff: 1,
  totalStaffNeeded: 3,
  scanRate: 0,
  loadInPercent: 0,
};

const openEvent = {
  ...currentEvent,
  id: 'evt-scanner-open',
  title: 'Concierto Sin Convocatoria',
};

const completeEvent = {
  ...currentEvent,
  id: 'evt-scanner-complete',
  title: 'Concierto Convocatoria Completa',
};

const activeWorker = {
  id: 'usr-scanner-active',
  idCode: 'SCAN-ACTIVE',
  name: 'Mario Dentro',
  role: 'Auxiliar' as const,
  roleLabel: 'Auxiliar',
  status: 'IN' as const,
  checkedInTime: new Date().toISOString(),
  avatar: '',
  email: 'mario@example.com',
  phone: '+34 600 100 100',
  totalHours: 0,
  currentShiftHours: 0,
  currentShiftMins: 5,
};

const completedWorker = {
  ...activeWorker,
  id: 'usr-scanner-completed',
  idCode: 'SCAN-COMPLETED',
  name: 'Clara Finalizada',
  status: 'OUT' as const,
  checkedInTime: undefined,
  email: 'clara@example.com',
};

const pendingWorker = {
  ...activeWorker,
  id: 'usr-scanner-pending',
  idCode: 'SCAN-PENDING',
  name: 'Ángela Pendiente',
  role: 'Coordinación' as const,
  roleLabel: 'Coordinación',
  status: 'OUT' as const,
  checkedInTime: undefined,
  email: 'angela@example.com',
  phone: '+34 600 300 300',
};

const currentAssignments = [activeWorker, completedWorker, pendingWorker].map((worker) => ({
  id: worker.id,
  idCode: worker.idCode,
  name: worker.name,
  email: worker.email,
  phone: worker.phone,
  assignedRole: worker.role,
  createdAt: '2026-07-19T10:00:00.000Z',
}));

const shifts = [
  {
    id: 'shift-scanner-active',
    workerId: activeWorker.id,
    dateString: `${currentEvent.dateYear}-${currentEvent.dateMonth}-${currentEvent.dateDay}`,
    timespan: '19:00 - Present',
    durationLabel: 'Active',
    eventId: currentEvent.id,
    eventTitle: currentEvent.title,
    status: 'Active',
    startedAt: new Date().toISOString(),
  },
  {
    id: 'shift-scanner-completed',
    workerId: completedWorker.id,
    dateString: `${currentEvent.dateYear}-${currentEvent.dateMonth}-${currentEvent.dateDay}`,
    timespan: '17:00 - 18:00',
    durationLabel: '1h',
    eventId: currentEvent.id,
    eventTitle: currentEvent.title,
    status: 'Completed',
  },
  {
    id: 'shift-scanner-complete-event',
    workerId: completedWorker.id,
    dateString: `${completeEvent.dateYear}-${completeEvent.dateMonth}-${completeEvent.dateDay}`,
    timespan: '16:00 - 17:00',
    durationLabel: '1h',
    eventId: completeEvent.id,
    eventTitle: completeEvent.title,
    status: 'Completed',
  },
];

async function mockScannerData(page: Page, eventStaffRequests: Array<{ method: string; url: string }>) {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/mysql/events', (route) => route.fulfill({
    json: [currentEvent, openEvent, completeEvent],
  }));
  await page.route('**/api/mysql/staff', (route) => route.fulfill({
    json: [activeWorker, completedWorker, pendingWorker],
  }));
  await page.route('**/api/mysql/shifts', (route) => route.fulfill({ json: shifts }));
  await page.route('**/api/mysql/alerts', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/mysql/events/*/staff', async (route) => {
    const url = route.request().url();
    eventStaffRequests.push({ method: route.request().method(), url });

    if (url.includes(`/events/${currentEvent.id}/staff`)) {
      await route.fulfill({ json: currentAssignments });
      return;
    }
    if (url.includes(`/events/${completeEvent.id}/staff`)) {
      await route.fulfill({ json: [currentAssignments[1]] });
      return;
    }
    await route.fulfill({ json: [] });
  });
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
}

test('loads pending event staff, filters with rosterSearch and selects without checking in', async ({ page }) => {
  const eventStaffRequests: Array<{ method: string; url: string }> = [];
  const checkInRequests: Array<{ method: string; url: string }> = [];
  await mockScannerData(page, eventStaffRequests);
  await page.route('**/api/mysql/checkin', (route) => {
    checkInRequests.push({ method: route.request().method(), url: route.request().url() });
    return route.fulfill({ status: 500, json: { message: 'A selection must not check in' } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Lector QR/i }).first().click();

  await expect(page.getByTestId('scanner-event-staff-list')).toBeVisible();
  await expect(page.getByRole('button', { name: `Seleccionar a ${pendingWorker.name} de la convocatoria` })).toBeVisible();
  await expect(page.getByRole('button', { name: `Seleccionar a ${activeWorker.name} de la convocatoria` })).not.toBeVisible();
  await expect(page.getByRole('button', { name: `Seleccionar a ${completedWorker.name} de la convocatoria` })).not.toBeVisible();

  await page.getByLabel('Filtrar pendientes de convocatoria').fill('ANGELA');
  await page.getByRole('button', { name: `Seleccionar a ${pendingWorker.name} de la convocatoria` }).click();

  await expect(page.getByTestId('scanner-selected-worker-name')).toHaveText(pendingWorker.name);
  await expect(page.getByRole('button', { name: 'INICIO TURNO 1 CLIC' })).toBeVisible();
  expect(checkInRequests).toEqual([]);
  expect(eventStaffRequests).toContainEqual({
    method: 'GET',
    url: expect.stringContaining(`/api/mysql/events/${currentEvent.id}/staff`),
  });
});

test('reloads the section on event change and shows open and complete call-sheet states', async ({ page }) => {
  const eventStaffRequests: Array<{ method: string; url: string }> = [];
  await mockScannerData(page, eventStaffRequests);

  await page.goto('/');
  await page.getByRole('button', { name: /Lector QR/i }).first().click();
  await expect(page.getByTestId('scanner-event-staff-list')).toBeVisible();

  const eventSelector = page.locator('#qr-access-system').locator('..').getByRole('combobox');
  await eventSelector.selectOption(openEvent.id);
  await expect(page.getByTestId('scanner-event-staff-open')).toContainText('cualquier colaborador puede fichar libremente');

  await eventSelector.selectOption(completeEvent.id);
  await expect(page.getByTestId('scanner-event-staff-complete')).toContainText('Convocatoria completa');

  expect(eventStaffRequests).toEqual(expect.arrayContaining([
    { method: 'GET', url: expect.stringContaining(`/api/mysql/events/${openEvent.id}/staff`) },
    { method: 'GET', url: expect.stringContaining(`/api/mysql/events/${completeEvent.id}/staff`) },
  ]));
});
