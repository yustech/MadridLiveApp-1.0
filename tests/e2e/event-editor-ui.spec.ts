import { expect, test, type Page } from '@playwright/test';
import { seedOnboardingSeen } from './helpers/onboarding';

const lockedEvent = {
  id: 'event-editor-locked',
  title: 'Evento Bloqueado',
  location: 'Sala Uno',
  dateDay: '30',
  dateMonth: 'JUL',
  dateYear: '2027',
  doorsOpen: '19:00',
  requiredStaff: 4,
  assignedStaffCount: 2,
  activeStaff: 0,
  totalStaffNeeded: 4,
  scanRate: 0,
  loadInPercent: 0,
};

const linkedShift = {
  id: 'shift-editor-1',
  workerId: 'worker-1',
  dateString: '',
  timespan: '',
  durationLabel: '',
  eventId: lockedEvent.id,
  eventTitle: lockedEvent.title,
  status: 'Completed',
};

async function openMockApp(page: Page, role: 'admin' | 'operator' | 'viewer', requests: Array<Record<string, unknown>>) {
  await seedOnboardingSeen(page, { role });
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true, role } }));
  await page.route(/\/api\/mysql\/events(?:\/.*)?$/, async (route) => {
    const method = route.request().method();
    const pathname = new URL(route.request().url()).pathname;
    if (method === 'GET') return route.fulfill({ json: [lockedEvent] });
    requests.push({ method, pathname, body: method === 'DELETE' ? undefined : route.request().postDataJSON() });
    return route.fulfill({ status: method === 'POST' ? 201 : 200, json: method === 'POST' ? { id: 'created' } : { success: true } });
  });
  await page.route('**/api/mysql/staff', (route) => route.fulfill({ json: [] }));
  await page.route('**/api/mysql/shifts', (route) => route.fulfill({ json: [linkedShift] }));
  await page.route('**/api/mysql/alerts', (route) => route.fulfill({ json: [] }));
  await page.goto('/');
}

test('admin creates, edits a locked event and deletes with exact request contracts', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await openMockApp(page, 'admin', requests);

  await page.getByRole('button', { name: '+ Nuevo evento' }).click();
  await page.getByRole('textbox', { name: 'Título' }).fill('Evento Nuevo');
  await page.getByRole('textbox', { name: 'Sitio' }).fill('IFEMA');
  await page.getByLabel('Fecha').fill('2027-08-08');
  await page.getByLabel('Apertura de puertas').fill('20:30');
  await page.getByLabel('Personal requerido').fill('12');
  await page.getByRole('button', { name: 'Guardar evento' }).click();

  await page.getByText(lockedEvent.title, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Editar evento' }).click();
  await expect(page.getByLabel('Fecha')).toBeDisabled();
  await expect(page.getByLabel('Apertura de puertas')).toBeDisabled();
  await page.getByRole('textbox', { name: 'Sitio' }).fill('Sala Dos');
  await page.getByLabel('Personal requerido').fill('6');
  await page.getByRole('button', { name: 'Guardar evento' }).click();

  await page.getByText(lockedEvent.title, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Borrar evento' }).click();
  const deleteButton = page.getByRole('button', { name: 'Borrar evento' });
  await expect(deleteButton).toBeDisabled();
  await page.getByLabel(new RegExp(`Escribe ${lockedEvent.title}`)).fill(lockedEvent.title.toLowerCase());
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();

  expect(requests).toEqual([
    {
      method: 'POST',
      pathname: '/api/mysql/events',
      body: {
        title: 'Evento Nuevo', location: 'IFEMA', dateDay: '08', dateMonth: 'AGO', dateYear: '2027',
        doorsOpen: '20:30', requiredStaff: 12, totalStaffNeeded: 12, activeStaff: 0, scanRate: 0, loadInPercent: 0,
      },
    },
    {
      method: 'PATCH',
      pathname: `/api/mysql/events/${lockedEvent.id}`,
      body: { location: 'Sala Dos', requiredStaff: 6, totalStaffNeeded: 6 },
    },
    { method: 'DELETE', pathname: `/api/mysql/events/${lockedEvent.id}`, body: undefined },
  ]);
});

test('new event form keeps focus in the field being edited while background data refreshes', async ({ page }) => {
  await openMockApp(page, 'admin', []);

  await page.getByRole('button', { name: '+ Nuevo evento' }).click();
  await page.getByRole('textbox', { name: 'Título' }).fill('Evento sin salto de foco');
  const location = page.getByRole('textbox', { name: 'Sitio' });
  await location.fill('Metropolitano');
  await expect(location).toBeFocused();

  // Los pollers actualizan el Dashboard cada 3 s y recrean su callback onClose.
  // El autofocus inicial no debe volver a ejecutarse por ese rerender del padre.
  await page.waitForTimeout(3_200);
  await expect(location).toBeFocused();
  await location.pressSequentially(' Madrid');
  await expect(location).toHaveValue('Metropolitano Madrid');

  const requiredStaff = page.getByLabel('Personal requerido');
  await requiredStaff.fill('25');
  await expect(requiredStaff).toBeFocused();
});

test('operator can create events but cannot edit or delete them', async ({ page }) => {
  const requests: Array<Record<string, unknown>> = [];
  await openMockApp(page, 'operator', requests);

  await page.getByRole('button', { name: '+ Nuevo evento' }).click();
  await page.getByRole('textbox', { name: 'Título' }).fill('Evento Operador');
  await page.getByRole('textbox', { name: 'Sitio' }).fill('IFEMA');
  await page.getByLabel('Fecha').fill('2027-08-08');
  await page.getByLabel('Apertura de puertas').fill('20:30');
  await page.getByLabel('Personal requerido').fill('12');
  await page.getByRole('button', { name: 'Guardar evento' }).click();

  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({
    method: 'POST',
    pathname: '/api/mysql/events',
    body: { title: 'Evento Operador', location: 'IFEMA' },
  });

  await page.getByText(lockedEvent.title, { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Editar evento' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Borrar evento' })).toHaveCount(0);
});

test('viewer cannot see event mutation actions', async ({ page }) => {
  await openMockApp(page, 'viewer', []);
  await expect(page.getByRole('button', { name: '+ Nuevo evento' })).toHaveCount(0);
  await page.getByText(lockedEvent.title, { exact: true }).first().click();
  await expect(page.getByRole('button', { name: 'Editar evento' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Borrar evento' })).toHaveCount(0);
});
