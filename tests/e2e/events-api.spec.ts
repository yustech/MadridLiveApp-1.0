import { expect, test, type APIRequestContext } from '@playwright/test';

const ADMIN_API_TOKEN = process.env.PLAYWRIGHT_ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN || '';
const LOCAL_MUTATION_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function assertLocalMutationTarget() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
  if (!LOCAL_MUTATION_HOSTS.has(new URL(baseUrl).hostname)) {
    throw new Error(`Refusing to run event mutation checks against deployed URL ${baseUrl}.`);
  }
}

async function api(request: APIRequestContext, method: string, path: string, body?: unknown, admin = false) {
  const response = await request.fetch(path, {
    method,
    ...(body === undefined ? {} : { data: body }),
    headers: {
      'content-type': 'application/json',
      ...(admin ? { 'x-admin-token': ADMIN_API_TOKEN } : {}),
    },
  });
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status(), text, json };
}

test('events API validates CRUD, locks dates and propagates titles', async ({ request }) => {
  assertLocalMutationTarget();
  test.skip(!ADMIN_API_TOKEN, 'An admin API token is required for events integration coverage.');

  const stamp = Date.now();
  const payload = {
    title: `Events API ${stamp}`,
    location: 'Sala API',
    dateDay: '01',
    dateMonth: 'ENE',
    dateYear: '2026',
    doorsOpen: '18:00',
    requiredStaff: 1,
    totalStaffNeeded: 1,
    activeStaff: 0,
    scanRate: 0,
    loadInPercent: 0,
  };
  const workerPayload = {
    idCode: `EV${stamp}`.slice(0, 20),
    name: `Worker Events API ${stamp}`,
    role: 'Auxiliar',
    roleLabel: 'Auxiliar',
    status: 'OUT',
    avatar: '',
    totalHours: 0,
    currentShiftHours: 0,
    currentShiftMins: 0,
  };
  let eventId = '';
  let workerId = '';

  try {
    expect((await api(request, 'POST', '/api/mysql/events', payload)).status).toBe(401);
    expect((await api(request, 'POST', '/api/mysql/events', { title: '' }, true)).status).toBe(400);

    const created = await api(request, 'POST', '/api/mysql/events', payload, true);
    expect(created.status, created.text).toBe(201);
    eventId = String(created.json?.id || '');
    const events = await api(request, 'GET', '/api/mysql/events', undefined, true);
    expect(events.json.some((event: { id: string }) => event.id === eventId)).toBe(true);

    expect((await api(request, 'DELETE', '/api/mysql/events/event_missing_e2e', undefined, true)).status).toBe(404);

    const worker = await api(request, 'POST', '/api/mysql/staff', workerPayload, true);
    expect(worker.status, worker.text).toBe(201);
    workerId = String(worker.json?.id || '');
    const assignment = await api(request, 'POST', `/api/mysql/events/${eventId}/staff`, { staffIds: [workerId] }, true);
    expect(assignment.status, assignment.text).toBe(200);
    const checkin = await api(request, 'POST', '/api/mysql/checkin', { workerId, eventId, location: 'Sala API' }, true);
    expect(checkin.status, checkin.text).toBe(201);

    const renamedTitle = `${payload.title} Renamed`;
    expect((await api(request, 'PATCH', `/api/mysql/events/${eventId}`, { title: renamedTitle }, true)).status).toBe(200);
    const shifts = await api(request, 'GET', '/api/mysql/shifts', undefined, true);
    expect(shifts.json.find((shift: { eventId?: string }) => shift.eventId === eventId)?.eventTitle).toBe(renamedTitle);

    expect((await api(request, 'PATCH', `/api/mysql/events/${eventId}`, { dateDay: payload.dateDay }, true)).status).toBe(200);
    const locked = await api(request, 'PATCH', `/api/mysql/events/${eventId}`, { dateDay: '02' }, true);
    expect(locked.status, locked.text).toBe(409);
    expect(locked.json?.code).toBe('EVENT_HAS_SHIFTS');

    const deletedEventId = eventId;
    expect((await api(request, 'DELETE', `/api/mysql/events/${deletedEventId}`, undefined, true)).status).toBe(200);
    eventId = '';
    const remainingShifts = await api(request, 'GET', '/api/mysql/shifts', undefined, true);
    expect(remainingShifts.json.some((shift: { eventId?: string }) => shift.eventId === deletedEventId)).toBe(false);
    const assignments = await api(request, 'GET', `/api/mysql/events/${deletedEventId}/staff`, undefined, true);
    expect(assignments.status).toBe(404);
  } finally {
    if (eventId) await api(request, 'DELETE', `/api/mysql/events/${eventId}`, undefined, true);
    if (workerId) await api(request, 'DELETE', `/api/mysql/staff/${workerId}`, undefined, true);
  }
});
