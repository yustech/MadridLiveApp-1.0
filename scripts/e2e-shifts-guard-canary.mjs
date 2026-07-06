const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || 'https://inmosubastas.top';

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

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
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

function pickEvents(events) {
  const now = new Date();
  const today = startOfDay(now).getTime();

  const enriched = events
    .map((event) => ({ event, date: parseEventDate(event) }))
    .filter((entry) => entry.date instanceof Date && !Number.isNaN(entry.date.getTime()));

  const todayEvent = enriched.find((entry) => startOfDay(entry.date).getTime() === today)?.event || null;
  const futureEvent = enriched.find((entry) => startOfDay(entry.date).getTime() > today)?.event || null;

  return { todayEvent, futureEvent };
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

  const { todayEvent, futureEvent } = pickEvents(events);
  assert(todayEvent, 'No hay evento de hoy para validar alta/cierre de turno.');
  assert(futureEvent, 'No hay evento futuro para validar el bloqueo.');

  const worker = staff.find((s) => s.status === 'OUT') || staff[0];
  const nowIso = new Date().toISOString();

  const createToday = await api('/api/mysql/shifts', {
    method: 'POST',
    body: {
      workerId: worker.id,
      dateString: 'Hoy',
      timespan: '00:00 - Presente',
      durationLabel: 'Active',
      location: `Main Stage (${todayEvent.title})`,
      status: 'Active',
      startedAt: nowIso,
    },
  });

  assert(createToday.status === 201, `Fichaje en evento de hoy falló (status ${createToday.status}): ${createToday.text}`);

  const createdShiftId = createToday.json?.id;
  assert(createdShiftId, 'No se recibió id del turno creado para evento de hoy.');

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

    assert(closeToday.status === 200, `Cierre de turno de hoy falló (status ${closeToday.status}): ${closeToday.text}`);

    const shiftsRes = await api('/api/mysql/shifts');
    assert(shiftsRes.status === 200, `No se pudo leer shifts para validar canonical timestamps (status ${shiftsRes.status}).`);

    const shifts = Array.isArray(shiftsRes.json) ? shiftsRes.json : [];
    const createdShift = shifts.find((shift) => shift.id === createdShiftId);

    assert(Boolean(createdShift), 'No se encontró el turno recién creado al reconsultar shifts.');
    assert(Boolean(createdShift.startedAt), 'El turno creado no tiene startedAt persistido.');
    assert(Boolean(createdShift.endedAt), 'El turno cerrado no tiene endedAt persistido.');

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
      futureMessage.toLowerCase().includes('future event'),
      `Mensaje de bloqueo inesperado para evento futuro: ${futureMessage}`,
    );

    console.log(
      JSON.stringify({
        status: 'ok',
        baseUrl: BASE_URL,
        todayEvent: todayEvent.title,
        futureEvent: futureEvent.title,
        createdShiftId,
      }),
    );
  } finally {
    await api(`/api/mysql/shifts/${createdShiftId}`, { method: 'DELETE' });
  }
}

run().catch((error) => {
  console.error(error?.message || error);
  process.exit(1);
});
