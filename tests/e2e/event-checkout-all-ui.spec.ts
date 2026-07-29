import { expect, test } from '@playwright/test';
import { seedOnboardingSeen } from './helpers/onboarding';

const event = {
  id: 'event-checkout-all',
  title: 'Concierto Salida Conjunta',
  location: 'IFEMA',
  dateDay: '29',
  dateMonth: 'JUL',
  dateYear: '2026',
  doorsOpen: '19:00',
  requiredStaff: 1,
  assignedStaffCount: 1,
  activeStaff: 1,
  totalStaffNeeded: 1,
  scanRate: 0,
  loadInPercent: 0,
};

const worker = {
  id: 'worker-checkout-all',
  idCode: 'OUT-001',
  name: 'Lucía Salida',
  role: 'Auxiliar' as const,
  roleLabel: 'Auxiliar',
  status: 'IN' as const,
  avatar: '',
  phone: '602 618 048',
  totalHours: 0,
  currentShiftHours: 1,
  currentShiftMins: 0,
};

const activeShift = {
  id: 'shift-checkout-all',
  workerId: worker.id,
  dateString: '2026-07-29T16:42:00.000Z',
  timespan: '18:42 - Presente',
  durationLabel: 'Active',
  eventId: event.id,
  eventTitle: event.title,
  status: 'Active' as const,
  startedAt: '2026-07-29T16:42:00.000Z',
};

test('operator confirms event checkout and gets one directed WhatsApp link per worker', async ({ page }) => {
  await seedOnboardingSeen(page, { role: 'operator' });
  await page.addInitScript(() => sessionStorage.setItem('ml_auth', 'true'));
  await page.route('**/api/auth/session', (route) => route.fulfill({
    json: { authenticated: true, role: 'operator' },
  }));
  await page.route('**/api/mysql/events', (route) => route.fulfill({ json: [event] }));
  await page.route('**/api/mysql/staff', (route) => route.fulfill({ json: [worker] }));
  await page.route('**/api/mysql/shifts', (route) => route.fulfill({ json: [activeShift] }));
  await page.route('**/api/mysql/alerts', (route) => route.fulfill({ json: [] }));
  await page.route(`**/api/mysql/events/${event.id}/checkout-all`, async (route) => {
    expect(route.request().method()).toBe('POST');
    await route.fulfill({
      json: {
        success: true,
        results: [{
          action: 'checkout',
          staff: { ...worker, status: 'OUT', currentShiftHours: 0, currentShiftMins: 0 },
          shift: {
            ...activeShift,
            status: 'Completed',
            timespan: '18:42 - 23:17',
            endedAt: '2026-07-29T21:17:00.000Z',
          },
        }],
      },
    });
  });

  await page.goto('/');
  await page.getByText(event.title, { exact: true }).first().click();
  await page.getByRole('button', { name: 'Dar salida a todos · 1' }).click();
  await expect(page.getByText(/Se cerrarán 1 turnos activos/)).toBeVisible();
  await page.getByRole('button', { name: 'Confirmar salidas' }).click();

  const share = page.getByRole('link', { name: `Enviar salida por WhatsApp a ${worker.name}` });
  const href = await share.getAttribute('href');
  expect(href).not.toBeNull();
  const url = new URL(href!);
  expect(url.searchParams.get('phone')).toBe('34602618048');
  expect(url.searchParams.get('text')).toContain('ENTRADA*: 18:42');
  expect(url.searchParams.get('text')).toContain('SALIDA*: 23:17');
});
