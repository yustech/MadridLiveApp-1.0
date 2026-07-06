const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

function assert(condition, message) {
  if (!condition) throw new Error(message);
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

  return { status: response.status, json, text };
}

async function run() {
  const startedAtMs = Date.now();
  let createdShiftId = null;

  try {
    const [eventsRes, staffRes, shiftsRes] = await Promise.all([
      api('/api/mysql/events'),
      api('/api/mysql/staff'),
      api('/api/mysql/shifts'),
    ]);

    assert(eventsRes.status === 200, `No se pudieron leer eventos (status ${eventsRes.status}).`);
    assert(staffRes.status === 200, `No se pudo leer staff (status ${staffRes.status}).`);
    assert(shiftsRes.status === 200, `No se pudo leer shifts (status ${shiftsRes.status}).`);

    const events = Array.isArray(eventsRes.json) ? eventsRes.json : [];
    const staff = Array.isArray(staffRes.json) ? staffRes.json : [];
    const shiftsSnapshot = Array.isArray(shiftsRes.json) ? shiftsRes.json : [];

    assert(events.length > 0, 'No hay eventos para ejecutar regresión de shifts API.');
    assert(staff.length > 0, 'No hay staff para ejecutar regresión de shifts API.');

    const activeWorkerIds = new Set(
      shiftsSnapshot
        .filter((shift) => shift.status === 'Active')
        .map((shift) => shift.workerId),
    );

    const candidateWorkers = staff.filter((member) => !activeWorkerIds.has(member.id));

    const orderedEvents = events
      .slice()
      .sort((a, b) => {
        const aTs = parseEventDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
        const bTs = parseEventDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
        return aTs - bTs;
      });

    let worker = null;
    let allowedEvent = null;
    let futureEvent = null;
    let duplicateActiveBlocked = false;

    for (const candidateWorker of candidateWorkers) {
      for (const event of orderedEvents) {
        const createAttempt = await api('/api/mysql/shifts', {
          method: 'POST',
          body: {
            workerId: candidateWorker.id,
            dateString: 'Hoy',
            timespan: '00:00 - Presente',
            durationLabel: 'Active',
            location: `Main Stage (${event.title})`,
            status: 'Active',
            startedAt: new Date().toISOString(),
          },
        });

        const guardMsg = String(createAttempt.json?.message || createAttempt.text || '');

        if (createAttempt.status === 201) {
          worker = candidateWorker;
          allowedEvent = event;
          createdShiftId = createAttempt.json?.id || null;
          break;
        }

        if (createAttempt.status === 400 && isFutureGuardMessage(guardMsg)) {
          if (!futureEvent) futureEvent = event;
          continue;
        }

        if (createAttempt.status === 409 && guardMsg.toLowerCase().includes('active shift')) {
          break;
        }

        throw new Error(
          `Alta de turno inesperada para evento ${event.title} (status ${createAttempt.status}): ${createAttempt.text}`,
        );
      }

      if (createdShiftId) {
        break;
      }
    }

    assert(worker, 'No se encontró personal disponible sin turno activo para validar.');
    assert(allowedEvent, 'No se encontró evento permitido para validar alta/cierre.');
    assert(createdShiftId, 'No se recibió id del turno creado.');

    const duplicateActiveRes = await api('/api/mysql/shifts', {
      method: 'POST',
      body: {
        workerId: worker.id,
        dateString: 'Hoy',
        timespan: '00:01 - Presente',
        durationLabel: 'Active',
        location: `Main Stage (${allowedEvent.title})`,
        status: 'Active',
        startedAt: new Date().toISOString(),
      },
    });

    duplicateActiveBlocked = duplicateActiveRes.status === 409;
    assert(
      duplicateActiveBlocked,
      `Doble turno activo debería bloquearse con 409 y devolvió ${duplicateActiveRes.status}: ${duplicateActiveRes.text}`,
    );

    const closeRes = await api(`/api/mysql/shifts/${createdShiftId}`, {
      method: 'PATCH',
      body: {
        status: 'Completed',
        timespan: '00:00 - 00:05',
        durationLabel: '0.1h',
        endedAt: new Date().toISOString(),
      },
    });
    assert(closeRes.status === 200, `Cierre de turno falló (status ${closeRes.status}): ${closeRes.text}`);

    const shiftsAfterCloseRes = await api('/api/mysql/shifts');
    assert(shiftsAfterCloseRes.status === 200, `No se pudo leer shifts (status ${shiftsAfterCloseRes.status}).`);

    const shifts = Array.isArray(shiftsAfterCloseRes.json) ? shiftsAfterCloseRes.json : [];
    const createdShift = shifts.find((shift) => shift.id === createdShiftId);
    assert(Boolean(createdShift), 'No se encontró el turno creado al reconsultar shifts.');

    const hasCanonicalTimestamps = Boolean(createdShift.startedAt) && Boolean(createdShift.endedAt);

    if (!futureEvent) {
      for (const event of orderedEvents.slice().reverse()) {
        if (event.id === allowedEvent.id) continue;

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

    assert(futureEvent, 'No se encontró evento futuro para validar bloqueo.');

    const futureRes = await api('/api/mysql/shifts', {
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

    assert(futureRes.status === 400, `Evento futuro debería bloquear y devolvió ${futureRes.status}: ${futureRes.text}`);
    assert(
      isFutureGuardMessage(futureRes.json?.message || futureRes.text),
      `Mensaje de bloqueo inesperado para evento futuro: ${futureRes.text}`,
    );

    const durationMs = Date.now() - startedAtMs;
    console.log(JSON.stringify({
      test: 'shifts-api-regression',
      status: 'ok',
      baseUrl: BASE_URL,
      duration_ms: durationMs,
      allowedEvent: allowedEvent.title,
      futureEvent: futureEvent.title,
      hasCanonicalTimestamps,
      duplicateActiveBlocked,
    }));
  } catch (error) {
    const durationMs = Date.now() - startedAtMs;
    console.error(JSON.stringify({
      test: 'shifts-api-regression',
      status: 'fail',
      baseUrl: BASE_URL,
      duration_ms: durationMs,
      message: error?.message || String(error),
    }));
    process.exit(1);
  } finally {
    if (createdShiftId) {
      await api(`/api/mysql/shifts/${createdShiftId}`, { method: 'DELETE' });
    }
  }
}

run();
