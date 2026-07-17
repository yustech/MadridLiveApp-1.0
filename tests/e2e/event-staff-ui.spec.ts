import { expect, test, type Page, type Route } from '@playwright/test';

const now = new Date();
const event = {
  id: 'evt-ui-e2e',
  title: 'Concierto UI E2E',
  location: 'Sala Mock',
  dateDay: String(now.getDate()),
  dateMonth: String(now.getMonth() + 1),
  dateYear: String(now.getFullYear()),
  doorsOpen: '19:00',
  requiredStaff: 2,
  activeStaff: 0,
  totalStaffNeeded: 2,
  scanRate: 0,
  loadInPercent: 25,
};

const baseWorker = {
  id: 'usr-assigned-e2e',
  idCode: 'E2E-ASSIGNED',
  name: 'Ángela Asignada',
  role: 'Auxiliar' as const,
  roleLabel: 'Auxiliar',
  status: 'OUT' as const,
  avatar: '',
  email: 'asignada@example.com',
  phone: '+34 600 100 100',
  totalHours: 0,
  currentShiftHours: 0,
  currentShiftMins: 0,
};

const availableWorker = {
  ...baseWorker,
  id: 'usr-available-e2e',
  idCode: 'E2E-AVAILABLE',
  name: 'Mónica Disponible',
  role: 'Auxiliar Plus' as const,
  roleLabel: 'Auxiliar Plus',
  email: 'monica@example.com',
};

async function mockBaseData(page: Page) {
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true } }));
  await page.route('**/api/mysql/events', (route) => route.fulfill({ json: [event] }));
  await page.route('**/api/mysql/staff', (route) => route.fulfill({ json: [baseWorker, availableWorker] }));
  await page.route(/\/api\/mysql\/(shifts|alerts)$/, (route) => route.fulfill({ json: [] }));
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
}

test('manages event staff with the expected GET, POST, PATCH and DELETE routes', async ({ page }) => {
  let assigned = [{
    id: baseWorker.id,
    idCode: baseWorker.idCode,
    name: baseWorker.name,
    email: baseWorker.email,
    phone: baseWorker.phone,
    assignedRole: 'Auxiliar',
    createdAt: '2026-07-17T00:00:00.000Z',
  }];
  const requests: Array<{ method: string; url: string; body: unknown }> = [];

  await mockBaseData(page);
  await page.route(`**/api/mysql/events/${event.id}/staff`, async (route) => {
    const method = route.request().method();
    requests.push({ method, url: route.request().url(), body: route.request().postDataJSON() });
    if (method === 'POST') {
      assigned.push({
        id: availableWorker.id,
        idCode: availableWorker.idCode,
        name: availableWorker.name,
        email: availableWorker.email,
        phone: availableWorker.phone,
        assignedRole: availableWorker.role,
        createdAt: '2026-07-17T00:00:00.000Z',
      });
      await route.fulfill({ json: { added: [availableWorker.id], alreadyAssigned: [], failed: [] } });
      return;
    }
    await route.fulfill({ json: assigned });
  });
  await page.route(`**/api/mysql/events/${event.id}/staff/*`, async (route) => {
    const method = route.request().method();
    const body = route.request().postDataJSON();
    requests.push({ method, url: route.request().url(), body });
    const staffId = route.request().url().split('/').at(-1);
    if (method === 'PATCH') {
      assigned = assigned.map((worker) => worker.id === staffId ? { ...worker, assignedRole: body.assignedRole } : worker);
    } else if (method === 'DELETE') {
      assigned = assigned.filter((worker) => worker.id !== staffId);
    }
    await route.fulfill({ json: { success: true } });
  });

  await page.goto('/');
  await page.getByText(event.title, { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Gestionar equipo · 1/2' })).toBeVisible();
  await page.getByRole('button', { name: 'Gestionar equipo · 1/2' }).click();
  await expect(page.getByRole('heading', { name: event.title })).toBeVisible();

  await page.getByLabel(`Seleccionar ${availableWorker.name}`).check();
  await page.getByRole('button', { name: 'Añadir seleccionados (1)' }).click();
  await expect(page.getByText('Añadidos:')).toBeVisible();

  const availableRow = page.getByRole('row').filter({ hasText: availableWorker.name });
  await availableRow.getByRole('button', { name: availableWorker.role }).click();
  const roleEditor = availableRow.getByLabel(`Rol asignado de ${availableWorker.name}`);
  await roleEditor.selectOption('Coordinación');
  await roleEditor.press('Enter');
  await expect(availableRow.getByText('Guardado', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: `Quitar a ${baseWorker.name} del concierto` }).click();
  await page.getByRole('button', { name: 'Quitar', exact: true }).click();
  await expect(page.getByRole('button', { name: `Quitar a ${baseWorker.name} del concierto` })).not.toBeVisible();

  expect(requests).toEqual(expect.arrayContaining([
    expect.objectContaining({ method: 'GET', url: expect.stringContaining(`/api/mysql/events/${event.id}/staff`) }),
    expect.objectContaining({ method: 'POST', url: expect.stringContaining(`/api/mysql/events/${event.id}/staff`), body: { staffIds: [availableWorker.id] } }),
    expect.objectContaining({ method: 'PATCH', url: expect.stringContaining(`/api/mysql/events/${event.id}/staff/${availableWorker.id}`), body: { assignedRole: 'Coordinación' } }),
    expect.objectContaining({ method: 'DELETE', url: expect.stringContaining(`/api/mysql/events/${event.id}/staff/${baseWorker.id}`) }),
  ]));
});

test('confirms NOT_ASSIGNED separately and retries check-in with force true', async ({ page }) => {
  const checkIns: Array<{ method: string; url: string; body: Record<string, unknown> }> = [];
  await mockBaseData(page);
  await page.route('**/api/mysql/checkin', async (route: Route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>;
    checkIns.push({ method: route.request().method(), url: route.request().url(), body });
    if (body.force !== true) {
      await route.fulfill({
        status: 409,
        json: { success: false, code: 'NOT_ASSIGNED', message: 'Worker not assigned to this event.' },
      });
      return;
    }
    await route.fulfill({
      status: 201,
      json: {
        success: true,
        action: 'checkin',
        staff: { ...availableWorker, status: 'IN', checkedInTime: '19:01' },
        shift: {
          id: 'shift-force-e2e',
          workerId: availableWorker.id,
          dateString: 'Today',
          timespan: '19:01 - Present',
          durationLabel: 'Active',
          eventId: event.id,
          eventTitle: event.title,
          status: 'Active',
        },
      },
    });
  });

  await page.goto('/');
  await page.getByRole('button', { name: /Lector QR/i }).first().click();
  await page.getByRole('button', { name: /Ingreso Manual de ID/i }).click();
  await page.locator('input[placeholder*="SEC-042"]').fill(availableWorker.idCode);
  await page.getByRole('button', { name: /^ENVIAR$/i }).click();

  await expect(page.getByRole('heading', { name: 'No está convocado para este evento' })).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar entrada' }).click();
  await expect(page.getByRole('heading', { name: 'Escaneo Completado' })).toBeVisible();

  expect(checkIns).toHaveLength(2);
  expect(checkIns[0]).toMatchObject({
    method: 'POST',
    url: expect.stringContaining('/api/mysql/checkin'),
    body: { workerId: availableWorker.id, eventId: event.id, location: 'Lector Puerta Principal' },
  });
  expect(checkIns[0].body).not.toHaveProperty('force');
  expect(checkIns[1]).toMatchObject({
    method: 'POST',
    url: expect.stringContaining('/api/mysql/checkin'),
    body: { workerId: availableWorker.id, eventId: event.id, location: 'Lector Puerta Principal', force: true },
  });
});
