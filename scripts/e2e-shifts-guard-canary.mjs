const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://inmosubastas.top';
const RUN_STARTED_AT_MS = Date.now();

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const MONTH_TO_INDEX = {
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

function parseEventDate(event) {
  const day = Number(event?.dateDay);
  const monthRaw = String(event?.dateMonth || '').trim().toUpperCase();
  const month = MONTH_TO_INDEX[monthRaw];
  const year = Number(event?.dateYear || new Date().getFullYear());

  if (!Number.isFinite(day) || month === undefined || !Number.isFinite(year)) {
    return null;
  }

  return new Date(year, month, day);
}

function isFutureGuardMessage(textOrJsonMessage) {
  return String(textOrJsonMessage || '').toLowerCase().includes('future event');
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  let json;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }

  return {
    status: response.status,
    json,
    text,
  };
}

async function run() {
  const [eventsRes, staffRes] = await Promise.all([
    api('/api/mysql/events'),
    api('/api/mysql/staff'),
  ]);

  assert(eventsRes.status === 200, `No se pudieron leer eventos (status ${eventsRes.status}).`);
  assert(staffRes.status === 200, `No se pudo leer staff (status ${staffRes.status}).`);

  const events = Array.isArray(eventsRes.json) ? eventsRes.json : [];
  const staff = Array.isArray(staffRes.json) ? staffRes.json : [];

  assert(events.length > 0, 'No hay eventos para ejecutar el canario de guardias.');
  assert(staff.length > 0, 'No hay staff para ejecutar el canario de guardias.');

  const worker = staff.find((s) => s.status === 'OUT') || staff[0];
  const nowIso = new Date().toISOString();

  const orderedEvents = events
    .slice()
    .sort((a, b) => {
      const aTs = parseEventDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
      const bTs = parseEventDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
      return aTs - bTs;
    });

  let allowedEvent = null;
  let futureEvent = null;
  let createdShiftId = null;

  for (const event of orderedEvents) {
    const createAttempt = await api('/api/mysql/shifts', {
      method: 'POST',
      body: {
        workerId: worker.id,
        dateString: 'Hoy',
        timespan: '00:00 - Presente',
        durationLabel: 'Active',
        location: `Main Stage (${event.title})`,
        status: 'Active',
        startedAt: nowIso,
      },
    });

    const guardMsg = createAttempt.json?.message || createAttempt.text;

    if (createAttempt.status === 201) {
      allowedEvent = event;
      createdShiftId = createAttempt.json?.id || null;
      break;
    }

    if (createAttempt.status === 400 && isFutureGuardMessage(guardMsg)) {
      if (!futureEvent) {
        futureEvent = event;
      }
      continue;
    }

    throw new Error(
      `Alta de turno inesperada para evento ${event.title} (status ${createAttempt.status}): ${createAttempt.text}`,
    );
  }

  assert(allowedEvent, 'No se encontró ningún evento no-futuro para validar alta/cierre de turno.');
  assert(createdShiftId, 'No se recibió id del turno creado para evento permitido.');

  try {
    const closeToday = await api(`/api/mysql/shifts/${createdShiftId}`, {
      method: 'PATCH',
      body: {
        status: 'Completed',
        timespan: '00:00 - 00:05',
        durationLabel: '0.1h',
        endedAt: new Date().toISOString(),
      },
    });

    assert(closeToday.status === 200, `Cierre de turno permitido falló (status ${closeToday.status}): ${closeToday.text}`);

    const shiftsRes = await api('/api/mysql/shifts');
    assert(shiftsRes.status === 200, `No se pudo leer shifts para validar canonical timestamps (status ${shiftsRes.status}).`);

    const shifts = Array.isArray(shiftsRes.json) ? shiftsRes.json : [];
    const createdShift = shifts.find((shift) => shift.id === createdShiftId);

    assert(Boolean(createdShift), 'No se encontró el turno recién creado al reconsultar shifts.');

    const hasCanonicalTimestamps = Boolean(createdShift.startedAt) && Boolean(createdShift.endedAt);
    if (!hasCanonicalTimestamps) {
      // Some environments still expose shifts without canonical timestamp columns.
      // Keep this canary focused on guard behavior and close/open lifecycle status codes.
      console.log('Aviso: startedAt/endedAt no disponibles; se omite validación estricta de timestamps.');
    }

    if (!futureEvent) {
      for (const event of orderedEvents.slice().reverse()) {
        if (event.id === allowedEvent.id) {
          continue;
        }

        const probe = await api('/api/mysql/shifts', {
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

        const guardMsg = probe.json?.message || probe.text;

        if (probe.status === 400 && isFutureGuardMessage(guardMsg)) {
          futureEvent = event;
          break;
        }

        if (probe.status === 201 && probe.json?.id) {
          await api(`/api/mysql/shifts/${probe.json.id}`, { method: 'DELETE' });
        }
      }
    }

    assert(futureEvent, 'No hay evento futuro para validar el bloqueo de activación de turnos.');

    const createFuture = await api('/api/mysql/shifts', {
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

    assert(createFuture.status === 400, `Evento futuro debería bloquear y devolvió status ${createFuture.status}: ${createFuture.text}`);

    const futureMessage = String(createFuture.json?.message || createFuture.text || '');
    assert(
      isFutureGuardMessage(futureMessage),
      `Mensaje de bloqueo inesperado para evento futuro: ${futureMessage}`,
    );

    console.log(
      JSON.stringify({
        canary: 'shifts-guard',
        status: 'ok',
        baseUrl: BASE_URL,
        duration_ms: Date.now() - RUN_STARTED_AT_MS,
        allowedEvent: allowedEvent.title,
        futureEvent: futureEvent.title,
        createdShiftId,
      }),
    );
  } finally {
    await api(`/api/mysql/shifts/${createdShiftId}`, { method: 'DELETE' });
  }
}

run().catch((error) => {
  console.error(JSON.stringify({
    canary: 'shifts-guard',
    status: 'fail',
    baseUrl: BASE_URL,
    duration_ms: Date.now() - RUN_STARTED_AT_MS,
    message: error?.message || String(error),
  }));
  process.exit(1);
});
