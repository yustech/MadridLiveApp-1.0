import { expect, test } from '@playwright/test';
import { seedOnboardingSeen } from './helpers/onboarding';

const now = new Date();
const event = {
  id: 'evt-template-ui', title: 'Festival Plantillas UI', location: 'Sala Mock',
  dateDay: String(now.getDate()), dateMonth: String(now.getMonth() + 1), dateYear: String(now.getFullYear()),
  doorsOpen: '18:00', requiredStaff: 2, assignedStaffCount: 1, activeStaff: 0, totalStaffNeeded: 2, scanRate: 0, loadInPercent: 10,
};
const worker = {
  id: 'usr-template-ui', idCode: 'TPL-UI-1', name: 'Ángela Plantilla', role: 'Auxiliar', roleLabel: 'Auxiliar',
  status: 'OUT', avatar: '', email: 'angela@example.com', phone: '+34 600 000 000', totalHours: 0,
  currentShiftHours: 0, currentShiftMins: 0,
};
const assignedMember = {
  id: worker.id, idCode: worker.idCode, name: worker.name, email: worker.email, phone: worker.phone,
  assignedRole: 'Auxiliar', createdAt: '2026-07-18T00:00:00.000Z',
};

test('saves, edits, applies and deletes a team template with exact method and route contracts', async ({ page }) => {
  await seedOnboardingSeen(page, { role: 'admin' });
  let templates: Array<any> = [];
  const requests: Array<{ method: string; pathname: string; body: unknown }> = [];

  await page.route('**/api/auth/session', (route) => route.fulfill({ json: { authenticated: true, role: 'admin' } }));
  await page.route('**/api/mysql/events', (route) => route.fulfill({ json: [event] }));
  await page.route('**/api/mysql/staff', (route) => route.fulfill({ json: [worker] }));
  await page.route(/\/api\/mysql\/(shifts|alerts)$/, (route) => route.fulfill({ json: [] }));
  await page.route(`**/api/mysql/events/${event.id}/staff`, (route) => route.fulfill({ json: [assignedMember] }));
  await page.route(/\/api\/mysql\/staff-templates(?:\/.*)?$/, async (route) => {
    const method = route.request().method();
    const pathname = new URL(route.request().url()).pathname;
    const body = method === 'GET' || method === 'DELETE' ? undefined : route.request().postDataJSON();
    requests.push({ method, pathname, body });

    if (method === 'GET') {
      await route.fulfill({ json: templates });
      return;
    }
    if (method === 'POST' && pathname === '/api/mysql/staff-templates') {
      const created = {
        id: 'tpl-ui-created', name: body.name, createdAt: '2026-07-18T00:00:00.000Z',
        members: [{ ...assignedMember }],
      };
      templates = [created];
      await route.fulfill({ status: 201, json: created });
      return;
    }
    if (method === 'PATCH') {
      templates = templates.map((template) => ({
        ...template,
        members: template.members.map((member: any) => ({ ...member, assignedRole: body.assignedRole })),
      }));
      await route.fulfill({ json: { success: true } });
      return;
    }
    if (method === 'POST' && pathname.endsWith('/apply')) {
      await route.fulfill({ json: { added: [], alreadyAssigned: [worker.id], failed: [] } });
      return;
    }
    if (method === 'DELETE') {
      templates = [];
      await route.fulfill({ json: { success: true } });
    }
  });

  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
  await page.goto('/');
  await page.getByText(event.title, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Gestionar equipo · 1/2' }).click();

  await page.getByRole('button', { name: 'Guardar como plantilla' }).click();
  await page.getByRole('textbox', { name: 'Nombre' }).fill('Equipo Festival');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  await expect(page.getByText('Equipo Festival', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Auxiliar', exact: true }).first().click();
  const roleEditor = page.getByLabel(`Rol de plantilla de ${worker.name}`);
  await roleEditor.selectOption('Coordinación');
  await roleEditor.press('Enter');
  await expect(page.getByText(`Rol de ${worker.name} actualizado en la plantilla.`)).toBeVisible();

  await page.getByRole('button', { name: 'Aplicar', exact: true }).click();
  await expect(page.getByText(/Plantilla aplicada: 0 añadidos, 1 ya convocados/)).toBeVisible();

  await page.getByRole('button', { name: 'Eliminar plantilla Equipo Festival' }).click();
  await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
  await expect(page.getByText('Plantilla “Equipo Festival” eliminada.')).toBeVisible();

  expect(requests).toEqual(expect.arrayContaining([
    { method: 'GET', pathname: '/api/mysql/staff-templates', body: undefined },
    { method: 'POST', pathname: '/api/mysql/staff-templates', body: { name: 'Equipo Festival', eventId: event.id } },
    { method: 'PATCH', pathname: `/api/mysql/staff-templates/tpl-ui-created/members/${worker.id}`, body: { assignedRole: 'Coordinación' } },
    { method: 'POST', pathname: '/api/mysql/staff-templates/tpl-ui-created/apply', body: { eventId: event.id } },
    { method: 'DELETE', pathname: '/api/mysql/staff-templates/tpl-ui-created', body: undefined },
  ]));
});
