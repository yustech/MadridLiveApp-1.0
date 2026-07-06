import { expect, test } from '@playwright/test';

type ApiResult = {
  status: number;
  json: any;
  text: string;
};

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

async function loginWithDemo(page: import('@playwright/test').Page) {
  await page.goto('/');

  const alreadyInside = await page.getByRole('button', { name: /Eventos \/ Control/i }).isVisible().catch(() => false);
  if (alreadyInside) return;

  await page.getByRole('button', { name: /Rellenar Credenciales Demo/i }).click();
  await page.getByRole('button', { name: /AUTENTICAR EN ENTORNO/i }).click();
  await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();
}

test.describe('Phase 1 - business edge coverage', () => {
  test('[readonly] shifts API allows current events and blocks future events', async ({ request }) => {
    const createdShiftIds: string[] = [];

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

      const worker =
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
        const attempt = await api(request, '/api/mysql/shifts', {
          method: 'POST',
          body: {
            workerId: worker.id,
            dateString: 'Hoy',
            timespan: '00:00 - Presente',
            durationLabel: 'Active',
            location: `Main Stage (${event.title})`,
            status: 'Active',
            startedAt: new Date().toISOString(),
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

          const probe = await api(request, '/api/mysql/shifts', {
            method: 'POST',
            body: {
              workerId: worker.id,
              dateString: 'Hoy',
              timespan: '00:00 - Presente',
              durationLabel: 'Active',
              location: `Main Stage (${event.title})`,
              status: 'Active',
              startedAt: new Date().toISOString(),
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

      expect(futureEvent).toBeTruthy();

      const futureAttempt = await api(request, '/api/mysql/shifts', {
        method: 'POST',
        body: {
          workerId: worker.id,
          dateString: 'Hoy',
          timespan: '00:00 - Presente',
          durationLabel: 'Active',
          location: `Main Stage (${futureEvent.title})`,
          status: 'Active',
          startedAt: new Date().toISOString(),
        },
      });

      expect(futureAttempt.status).toBe(400);
      expect(isFutureGuardMessage(String(futureAttempt.json?.message || futureAttempt.text || ''))).toBeTruthy();
    } finally {
      for (const id of createdShiftIds) {
        await api(request, `/api/mysql/shifts/${id}`, { method: 'DELETE' });
      }
    }
  });

  test('[readonly] scanner module remains usable after page refresh', async ({ page }) => {
    await loginWithDemo(page);

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await expect(page.getByText(/Punto de Registro QR Activo/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Ingreso Manual de ID/i })).toBeVisible();

    await page.reload();
    await expect(page.getByRole('button', { name: /Eventos \/ Control/i })).toBeVisible();

    await page.getByRole('button', { name: /Lector QR/i }).click();
    await expect(page.getByText(/Punto de Registro QR Activo/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Ingreso Manual de ID/i })).toBeVisible();
  });
});
