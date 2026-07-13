import { expect, test } from '@playwright/test';

type ApiResult = {
  status: number;
  json: any;
  text: string;
};

const ADMIN_API_TOKEN = process.env.PLAYWRIGHT_ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN || '';
const ADMIN_EMAIL = process.env.PLAYWRIGHT_ADMIN_EMAIL || '';
const ADMIN_PASSWORD = process.env.PLAYWRIGHT_ADMIN_PASSWORD || '';

const MONTH_TO_INDEX: Record<string, number> = {
  JAN: 0,
  FEB: 1,
  MAR: 2,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DEC: 11,
  ENE: 0,
  ABR: 3,
  AGO: 7,
  DIC: 11,
};

const MONTH_LABELS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
const LOCAL_MUTATION_HOSTS = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);

function assertLocalMutationTarget() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:5173';
  let hostname = '';

  try {
    hostname = new URL(baseUrl).hostname;
  } catch {
    throw new Error(`Invalid PLAYWRIGHT_BASE_URL for mutating E2E checks: ${baseUrl}`);
  }

  if (!LOCAL_MUTATION_HOSTS.has(hostname)) {
    throw new Error(
      `Refusing to run mutating E2E checks against deployed URL ${baseUrl}. ` +
      'Run these checks only against the isolated local CI app.'
    );
  }
}

function parseEventDate(event: any): Date | null {
  const day = Number(event?.dateDay);
  const monthRaw = String(event?.dateMonth || '').trim().toUpperCase();
  const month = MONTH_TO_INDEX[monthRaw];
  const year = Number(event?.dateYear || new Date().getFullYear());

  if (!Number.isFinite(day) || month === undefined || !Number.isFinite(year)) {
    return null;
  }

  return new Date(year, month, day);
}

function buildFutureEventPayload() {
  const now = new Date();
  const future = new Date(now);
  future.setDate(now.getDate() + 14);

  if (future.getFullYear() !== now.getFullYear()) {
    future.setFullYear(now.getFullYear(), 11, 31);
  }

  const stamp = future.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return {
    title: `Phase1 Edge Future Event ${stamp}`,
    location: 'QA Future Gate',
    dateDay: String(future.getDate()).padStart(2, '0'),
    dateMonth: MONTH_LABELS[future.getMonth()],
    doorsOpen: '23:59',
    requiredStaff: 0,
    activeStaff: 0,
    totalStaffNeeded: 0,
    scanRate: 0,
    loadInPercent: 0,
  };
}

function isFutureGuardMessage(payload: string) {
  return payload.toLowerCase().includes('future event');
}

function isMysqlUnconfiguredMessage(payload: string) {
  return payload.toLowerCase().includes('mysql is not configured');
}

function isShiftConflictGuardMessage(payload: string) {
  const normalized = payload.toLowerCase();
  return (
    normalized.includes('shift conflict:')
    && (
      normalized.includes('active shift')
      || normalized.includes('overlapping time range')
    )
  );
}

async function api(request: import('@playwright/test').APIRequestContext, path: string, options?: { method?: 'GET' | 'POST' | 'PATCH' | 'DELETE'; body?: unknown; }): Promise<ApiResult> {
  const response = await request.fetch(path, {
    method: options?.method || 'GET',
    data: options?.body,
    headers: {
      'content-type': 'application/json',
      ...(ADMIN_API_TOKEN ? { 'x-admin-token': ADMIN_API_TOKEN } : {}),
    },
  });

  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: response.status(),
    json,
    text,
  };
}

async function loginWithAdmin(page: import('@playwright/test').Page) {
  test.skip(!ADMIN_EMAIL || !ADMIN_PASSWORD, 'PLAYWRIGHT_ADMIN_EMAIL and PLAYWRIGHT_ADMIN_PASSWORD are required for login UI tests.');

  await page.goto('/');

  const alreadyInside = await page.getByRole('button', { name: /Eventos \/ Control/i }).isVisible().catch(() => false);
  if (alreadyInside) return;

  await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
  await page.locator('input[type="password"]').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i }).click();
  await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();
}

test.describe('Phase 1 - business edge coverage', () => {
  test('shifts API allows current events and blocks future events', async ({ request }) => {
    assertLocalMutationTarget();
    test.skip(!ADMIN_API_TOKEN, 'PLAYWRIGHT_ADMIN_API_TOKEN or ADMIN_API_TOKEN is required for admin API mutation checks.');

    const createdShiftIds: string[] = [];
    const createdStaffIds: string[] = [];
    const createdEventIds: string[] = [];

    try {
      const [eventsRes, staffRes] = await Promise.all([
        api(request, '/api/mysql/events'),
        api(request, '/api/mysql/staff'),
      ]);

      const eventsPayload = String(eventsRes.json?.message || eventsRes.json?.error || eventsRes.text || '');
      const staffPayload = String(staffRes.json?.message || staffRes.json?.error || staffRes.text || '');

      test.skip(
        (eventsRes.status === 500 && isMysqlUnconfiguredMessage(eventsPayload)) ||
          (staffRes.status === 500 && isMysqlUnconfiguredMessage(staffPayload)),
        'MySQL is not configured in this runner; skipping data-dependent shift guard checks.'
      );

      expect(eventsRes.status).toBe(200);
      expect(staffRes.status).toBe(200);

      const events = Array.isArray(eventsRes.json) ? eventsRes.json : [];
      const staff = Array.isArray(staffRes.json) ? staffRes.json : [];

      expect(events.length).toBeGreaterThan(0);
      expect(staff.length).toBeGreaterThan(0);

      const shiftsSnapshotRes = await api(request, '/api/mysql/shifts');
      expect(shiftsSnapshotRes.status).toBe(200);
      const shiftsSnapshot = Array.isArray(shiftsSnapshotRes.json) ? shiftsSnapshotRes.json : [];
      const workersWithActiveShift = new Set(
        shiftsSnapshot
          .filter((shift: any) => shift.status === 'Active')
          .map((shift: any) => shift.workerId)
      );

      let worker =
        staff.find((member: any) => member.status === 'OUT' && !workersWithActiveShift.has(member.id)) ||
        staff.find((member: any) => !workersWithActiveShift.has(member.id)) ||
        staff.find((member: any) => member.status === 'OUT') ||
        staff[0];
      const orderedEvents = events.slice().sort((a: any, b: any) => {
        const aTs = parseEventDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
        const bTs = parseEventDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
        return aTs - bTs;
      });

      let allowedEvent: any = null;
      let futureEvent: any = null;

      for (const event of orderedEvents) {
        const now = new Date();
        const later = new Date(now.getTime() + 3600000); // 1 hour later
        const attempt = await api(request, '/api/mysql/shifts', {
          method: 'POST',
          body: {
            workerId: worker.id,
            dateString: now.toISOString().split('T')[0], // YYYY-MM-DD format
            timespan: '00:00 - Presente',
            durationLabel: 'Active',
            eventId: event.id,
            eventTitle: event.title,
            status: 'Active',
            startedAt: now.toISOString(),
            endedAt: later.toISOString(),
          },
        });

        const guardPayload = String(attempt.json?.message || attempt.text || '');

        if (attempt.status === 201) {
          allowedEvent = event;
          const createdId = attempt.json?.id as string | undefined;
          if (createdId) createdShiftIds.push(createdId);
          break;
        }

        if (attempt.status === 400 && isFutureGuardMessage(guardPayload)) {
          futureEvent = futureEvent || event;
          continue;
        }

        if (attempt.status === 409 && isShiftConflictGuardMessage(guardPayload)) {
          continue;
        }

        throw new Error(`Unexpected shift creation response for ${event.title}: status ${attempt.status} payload=${attempt.text}`);
      }

      if (!allowedEvent) {
        const raceStaffRes = await api(request, '/api/mysql/staff', {
          method: 'POST',
          body: {
            idCode: `E2EEDGE${Date.now()}`.slice(0, 20),
            name: 'Edge E2E Worker',
            role: 'Auxiliar',
            roleLabel: 'AUXILIAR',
            status: 'OUT',
            checkedInTime: '-',
            lastSeen: 'Ahora',
            avatar: '',
            totalHours: 0,
            currentShiftHours: 0,
            currentShiftMins: 0,
            eventTitle: 'Main Stage',
          },
        });

        if (raceStaffRes.status !== 201 || !raceStaffRes.json?.id) {
          test.skip(true, `No se pudo provisionar worker temporal para edge E2E (status ${raceStaffRes.status}).`);
        }

        worker = {
          ...worker,
          id: raceStaffRes.json.id,
          status: 'OUT',
        };
        createdStaffIds.push(raceStaffRes.json.id);

        for (const event of orderedEvents) {
          const now = new Date();
          const later = new Date(now.getTime() + 3600000); // 1 hour later
          const retry = await api(request, '/api/mysql/shifts', {
            method: 'POST',
            body: {
              workerId: worker.id,
              dateString: now.toISOString().split('T')[0], // YYYY-MM-DD format
              timespan: '00:00 - Presente',
              durationLabel: 'Active',
              eventId: event.id,
            eventTitle: event.title,
              status: 'Active',
              startedAt: now.toISOString(),
              endedAt: later.toISOString(),
            },
          });

          const retryPayload = String(retry.json?.message || retry.text || '');

          if (retry.status === 201) {
            allowedEvent = event;
            const createdId = retry.json?.id as string | undefined;
            if (createdId) createdShiftIds.push(createdId);
            break;
          }

          if (retry.status === 400 && isFutureGuardMessage(retryPayload)) {
            futureEvent = futureEvent || event;
            continue;
          }

          if (retry.status === 409 && isShiftConflictGuardMessage(retryPayload)) {
            continue;
          }

          throw new Error(`Unexpected retry shift creation response for ${event.title}: status ${retry.status} payload=${retry.text}`);
        }
      }

      expect(allowedEvent).toBeTruthy();
      expect(createdShiftIds.length).toBeGreaterThan(0);

      const closeRes = await api(request, `/api/mysql/shifts/${createdShiftIds[0]}`, {
        method: 'PATCH',
        body: {
          status: 'Completed',
          timespan: '00:00 - 00:05',
          durationLabel: '0.1h',
          endedAt: new Date().toISOString(),
        },
      });
      expect(closeRes.status).toBe(200);

      const shiftsRes = await api(request, '/api/mysql/shifts');
      expect(shiftsRes.status).toBe(200);
      const shifts = Array.isArray(shiftsRes.json) ? shiftsRes.json : [];
      const createdShift = shifts.find((shift: any) => shift.id === createdShiftIds[0]);
      expect(createdShift).toBeTruthy();
      expect(createdShift.status).toBe('Completed');

      if (!futureEvent) {
        for (const event of orderedEvents.slice().reverse()) {
          if (event.id === allowedEvent.id) continue;

          const now = new Date();
          const later = new Date(now.getTime() + 3600000); // 1 hour later
          const probe = await api(request, '/api/mysql/shifts', {
            method: 'POST',
            body: {
              workerId: worker.id,
              dateString: now.toISOString().split('T')[0], // YYYY-MM-DD format
              timespan: '00:00 - Presente',
              durationLabel: 'Active',
              eventId: event.id,
            eventTitle: event.title,
              status: 'Active',
              startedAt: now.toISOString(),
              endedAt: later.toISOString(),
            },
          });

          const guardPayload = String(probe.json?.message || probe.text || '');
          if (probe.status === 400 && isFutureGuardMessage(guardPayload)) {
            futureEvent = event;
            break;
          }

          if (probe.status === 409 && isShiftConflictGuardMessage(guardPayload)) {
            continue;
          }

          if (probe.status === 201 && probe.json?.id) {
            createdShiftIds.push(probe.json.id);
          }
        }
      }

      if (!futureEvent) {
        const futureEventPayload = buildFutureEventPayload();
        const futureEventRes = await api(request, '/api/mysql/events', {
          method: 'POST',
          body: futureEventPayload,
        });

        expect(futureEventRes.status).toBe(201);
        expect(futureEventRes.json?.id).toBeTruthy();

        futureEvent = { id: futureEventRes.json.id, ...futureEventPayload };
        createdEventIds.push(futureEvent.id);
      }

      expect(futureEvent).toBeTruthy();

      const now = new Date();
      const later = new Date(now.getTime() + 3600000); // 1 hour later
      const futureAttempt = await api(request, '/api/mysql/shifts', {
        method: 'POST',
        body: {
          workerId: worker.id,
          dateString: now.toISOString().split('T')[0], // YYYY-MM-DD format
          timespan: '00:00 - Presente',
          durationLabel: 'Active',
          eventId: futureEvent.id,
          eventTitle: futureEvent.title,
          status: 'Active',
          startedAt: now.toISOString(),
          endedAt: later.toISOString(),
        },
      });

      expect(futureAttempt.status).toBe(400);
      expect(isFutureGuardMessage(String(futureAttempt.json?.message || futureAttempt.text || ''))).toBeTruthy();
    } finally {
      for (const id of createdShiftIds) {
        await api(request, `/api/mysql/shifts/${id}`, { method: 'DELETE' });
      }
      for (const staffId of createdStaffIds) {
        await api(request, `/api/mysql/staff/${staffId}`, { method: 'DELETE' });
      }
      for (const eventId of createdEventIds) {
        await api(request, `/api/mysql/events/${eventId}`, { method: 'DELETE' });
      }
    }
  });

  test('[readonly] scanner module remains usable after page refresh', async ({ page }) => {
    await loginWithAdmin(page);

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await expect(page.getByText(/Punto de Registro QR Activo/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Ingreso Manual de ID/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await expect(page.getByText(/Punto de Registro QR Activo/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Ingreso Manual de ID/i })).toBeVisible();
  });

  test('scanner supports immediate manual check-in and check-out without reload', async ({ page, request }) => {
    assertLocalMutationTarget();
    test.skip(!ADMIN_API_TOKEN, 'PLAYWRIGHT_ADMIN_API_TOKEN or ADMIN_API_TOKEN is required for scanner mutation checks.');

    const idCode = `FAST${Date.now()}`.slice(0, 20);
    const name = `Fast Toggle Worker ${idCode.slice(-6)}`;
    const today = new Date();
    const eventTitle = `Fast Toggle Event ${idCode.slice(-6)}`;
    let staffId = '';
    let eventId = '';

    try {
      const createStaffRes = await api(request, '/api/mysql/staff', {
        method: 'POST',
        body: {
          idCode,
          name,
          role: 'Auxiliar',
          roleLabel: 'AUXILIAR',
          status: 'OUT',
          checkedInTime: '',
          lastSeen: new Date().toISOString(),
          avatar: '',
          email: `${idCode.toLowerCase()}@example.test`,
          phone: '+34910000123',
          totalHours: 0,
          currentShiftHours: 0,
          currentShiftMins: 0,
          location: 'QA Fast Gate',
        },
      });

      test.skip(
        createStaffRes.status === 500 && isMysqlUnconfiguredMessage(String(createStaffRes.json?.message || createStaffRes.text || '')),
        'MySQL is not configured in this runner; skipping scanner mutation check.'
      );

      expect(createStaffRes.status).toBe(201);
      expect(createStaffRes.json?.id).toBeTruthy();
      staffId = createStaffRes.json.id;

      const createEventRes = await api(request, '/api/mysql/events', {
        method: 'POST',
        body: {
          title: eventTitle,
          location: 'QA Fast Venue',
          dateDay: String(today.getDate()).padStart(2, '0'),
          dateMonth: MONTH_LABELS[today.getMonth()],
          doorsOpen: '08:00',
          requiredStaff: 1,
          activeStaff: 0,
          totalStaffNeeded: 1,
          scanRate: 0,
          loadInPercent: 50,
        },
      });

      expect(createEventRes.status).toBe(201);
      expect(createEventRes.json?.id).toBeTruthy();
      eventId = createEventRes.json.id;

      await loginWithAdmin(page);
      await page.getByRole('button', { name: /Lector QR/i }).click();
      await page.locator('select').first().selectOption(eventId);
      await expect(page.locator('h3').filter({ hasText: eventTitle })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: /Ingreso Manual de ID/i }).click();
      await page.locator('input[placeholder*="SEC-042"]').fill(idCode);
      await page.getByRole('button', { name: /^ENVIAR$/i }).click();
      await expect(page.getByText(/ENTRADA REGISTRADA/i)).toBeVisible({ timeout: 12_000 });

      await page.getByRole('button', { name: /Volver a Escanear/i }).click();
      await page.getByRole('button', { name: /Ingreso Manual de ID/i }).click();
      await page.locator('input[placeholder*="SEC-042"]').fill(idCode);
      await page.getByRole('button', { name: /^ENVIAR$/i }).click();
      await expect(page.getByText(/SALIDA REGISTRADA/i)).toBeVisible({ timeout: 12_000 });

      await expect.poll(async () => {
        const staffRes = await api(request, '/api/mysql/staff');
        const staff = Array.isArray(staffRes.json) ? staffRes.json : [];
        return staff.find((member: any) => member.id === staffId)?.status;
      }).toBe('OUT');
    } finally {
      if (staffId) {
        const shiftsRes = await api(request, '/api/mysql/shifts');
        const shifts = Array.isArray(shiftsRes.json) ? shiftsRes.json : [];
        const workerShiftIds = shifts
          .filter((shift: any) => shift.workerId === staffId)
          .map((shift: any) => shift.id);

        for (const shiftId of workerShiftIds) {
          await api(request, `/api/mysql/shifts/${shiftId}`, { method: 'DELETE' });
        }

        await api(request, `/api/mysql/staff/${staffId}`, { method: 'DELETE' });
      }

      if (eventId) {
        await api(request, `/api/mysql/events/${eventId}`, { method: 'DELETE' });
      }
    }
  });

  test('scanner warns before manual check-in on a past event', async ({ page, request }) => {
    assertLocalMutationTarget();
    test.skip(!ADMIN_API_TOKEN, 'PLAYWRIGHT_ADMIN_API_TOKEN or ADMIN_API_TOKEN is required for scanner mutation checks.');

    const idCode = `PAST${Date.now()}`.slice(0, 20);
    const name = `Past Event Worker ${idCode.slice(-6)}`;
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    test.skip(
      yesterday.getFullYear() !== new Date().getFullYear(),
      'Event model stores current-year day/month only; skipping year-boundary past-event UI check.'
    );

    const eventTitle = `Past Warning Event ${idCode.slice(-6)}`;
    let staffId = '';
    let eventId = '';

    try {
      const createStaffRes = await api(request, '/api/mysql/staff', {
        method: 'POST',
        body: {
          idCode,
          name,
          role: 'Auxiliar',
          roleLabel: 'AUXILIAR',
          status: 'OUT',
          checkedInTime: '',
          lastSeen: new Date().toISOString(),
          avatar: '',
          email: `${idCode.toLowerCase()}@example.test`,
          phone: '+34910000123',
          totalHours: 0,
          currentShiftHours: 0,
          currentShiftMins: 0,
          location: 'QA Past Gate',
        },
      });

      test.skip(
        createStaffRes.status === 500 && isMysqlUnconfiguredMessage(String(createStaffRes.json?.message || createStaffRes.text || '')),
        'MySQL is not configured in this runner; skipping past-event scanner mutation check.'
      );

      expect(createStaffRes.status).toBe(201);
      expect(createStaffRes.json?.id).toBeTruthy();
      staffId = createStaffRes.json.id;

      const createEventRes = await api(request, '/api/mysql/events', {
        method: 'POST',
        body: {
          title: eventTitle,
          location: 'QA Past Venue',
          dateDay: String(yesterday.getDate()).padStart(2, '0'),
          dateMonth: MONTH_LABELS[yesterday.getMonth()],
          doorsOpen: '20:00',
          requiredStaff: 1,
          activeStaff: 0,
          totalStaffNeeded: 1,
          scanRate: 0,
          loadInPercent: 100,
        },
      });

      expect(createEventRes.status).toBe(201);
      expect(createEventRes.json?.id).toBeTruthy();
      eventId = createEventRes.json.id;

      await loginWithAdmin(page);
      await page.getByRole('button', { name: /Lector QR/i }).click();
      await page.locator('select').first().selectOption(eventId);
      await expect(page.locator('h3').filter({ hasText: eventTitle })).toBeVisible({ timeout: 10_000 });
      await expect(page.getByText(/Registro extendido activo|Evento pasado/i).first()).toBeVisible();
      await expect(page.getByText(name)).toBeVisible({ timeout: 10_000 });

      await page.getByRole('button', { name: /Ingreso Manual de ID/i }).click();
      await page.locator('input[placeholder*="SEC-042"]').fill(idCode);
      await page.getByRole('button', { name: /^ENVIAR$/i }).click();
      const warningModal = page.locator('.fixed').filter({
        has: page.getByRole('heading', { name: /Entrada en evento pasado/i }),
      });
      await expect(warningModal).toBeVisible();
      await expect(warningModal.getByText(idCode)).toBeVisible();
      await expect(warningModal.getByText(/20:00 hs/i)).toBeVisible();
      await warningModal.getByRole('button', { name: /Confirmar entrada/i }).click();
      await expect(page.getByText(/ENTRADA REGISTRADA/i)).toBeVisible({ timeout: 12_000 });

      await page.getByRole('button', { name: /Volver a Escanear/i }).click();
      await page.getByRole('button', { name: /Ingreso Manual de ID/i }).click();
      await page.locator('input[placeholder*="SEC-042"]').fill(idCode);
      await page.getByRole('button', { name: /^ENVIAR$/i }).click();
      await expect(page.getByText(/SALIDA REGISTRADA/i)).toBeVisible({ timeout: 12_000 });

      await expect.poll(async () => {
        const staffRes = await api(request, '/api/mysql/staff');
        const staff = Array.isArray(staffRes.json) ? staffRes.json : [];
        return staff.find((member: any) => member.id === staffId)?.status;
      }).toBe('OUT');
    } finally {
      if (staffId) {
        const shiftsRes = await api(request, '/api/mysql/shifts');
        const shifts = Array.isArray(shiftsRes.json) ? shiftsRes.json : [];
        const workerShiftIds = shifts
          .filter((shift: any) => shift.workerId === staffId)
          .map((shift: any) => shift.id);

        for (const shiftId of workerShiftIds) {
          await api(request, `/api/mysql/shifts/${shiftId}`, { method: 'DELETE' });
        }

        await api(request, `/api/mysql/staff/${staffId}`, { method: 'DELETE' });
      }

      if (eventId) {
        await api(request, `/api/mysql/events/${eventId}`, { method: 'DELETE' });
      }
    }
  });
});
