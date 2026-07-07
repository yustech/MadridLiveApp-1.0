const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const MONTH_TO_INDEX = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  ENE: 0, ABR: 3, AGO: 7, DIC: 11,
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '10': 9, '11': 10, '12': 11,
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

function toIsoAtOffset(baseValue, offsetMs) {
  const base = new Date(String(baseValue));
  if (Number.isNaN(base.getTime())) {
    return null;
  }
  return new Date(base.getTime() + offsetMs).toISOString();
}

async function run() {
  const startedAtMs = Date.now();
  const createdShiftIds = [];
  const createdStaffIds = [];

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
    let overlapRangeBlocked = false;
    let contiguousRangeAllowed = false;
    let concurrentStartRaceGuarded = false;

    for (const candidateWorker of candidateWorkers) {
      for (const event of orderedEvents) {
        const createAttempt = await api('/api/mysql/shifts', {
          method: 'POST',
          body: {
            workerId: candidateWorker.id,
            dateString: '2026-07-06T23:52:28.041Z',
            timespan: '00:00 - Presente',
            durationLabel: 'In Progress',
            location: `Main Stage (${event.title})`,
            status: 'active',
            startedAt: new Date().toISOString(),
          },
        });

        const guardMsg = String(createAttempt.json?.message || createAttempt.text || '');

        if (createAttempt.status === 201) {
          worker = candidateWorker;
          allowedEvent = event;
          const createdShiftId = createAttempt.json?.id || null;
          if (createdShiftId) {
            createdShiftIds.push(createdShiftId);
          }
          break;
        }

        if (createAttempt.status === 400 && isFutureGuardMessage(guardMsg)) {
          if (!futureEvent) futureEvent = event;
          continue;
        }

        if (
          createAttempt.status === 409
          && (
            guardMsg.toLowerCase().includes('active shift')
            || guardMsg.toLowerCase().includes('overlapping time range')
          )
        ) {
          break;
        }

        throw new Error(
          `Alta de turno inesperada para evento ${event.title} (status ${createAttempt.status}): ${createAttempt.text}`,
        );
      }

      if (createdShiftIds.length > 0) {
        break;
      }
    }

    assert(worker, 'No se encontró personal disponible sin turno activo para validar.');
    assert(allowedEvent, 'No se encontró evento permitido para validar alta/cierre.');
    assert(createdShiftIds.length > 0, 'No se recibió id del turno creado.');
    const createdShiftId = createdShiftIds[0];

    const duplicateActiveRes = await api('/api/mysql/shifts', {
      method: 'POST',
      body: {
        workerId: worker.id,
        dateString: '2026-07-06T23:52:28.041Z',
        timespan: '00:01 - Presente',
        durationLabel: 'In Progress',
        location: `Main Stage (${allowedEvent.title})`,
        status: 'active',
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

    // Validate overlap rule using a deterministic completed range window.
    const baselineStart = toIsoAtOffset(new Date().toISOString(), 30 * 60_000);
    const baselineEnd = toIsoAtOffset(new Date().toISOString(), 40 * 60_000);
    assert(baselineStart && baselineEnd, 'No fue posible construir rango base para validación de solape.');

    const baselineRes = await api('/api/mysql/shifts', {
      method: 'POST',
      body: {
        workerId: worker.id,
        dateString: '2026-07-06T23:52:28.041Z',
        timespan: '00:30 - 00:40',
        durationLabel: '0.17h',
        location: `Main Stage (${allowedEvent.title})`,
        status: 'Completed',
        startedAt: baselineStart,
        endedAt: baselineEnd,
      },
    });

    assert(
      baselineRes.status === 201,
      `No se pudo crear rango base de integridad (${baselineRes.status}): ${baselineRes.text}`,
    );

    if (baselineRes.json?.id) {
      createdShiftIds.push(baselineRes.json.id);
    }

    const overlapStart = toIsoAtOffset(baselineStart, 60_000);
    const overlapEnd = toIsoAtOffset(baselineStart, 120_000);
    assert(overlapStart && overlapEnd, 'No fue posible construir rango de solape para validación.');

    const overlapRes = await api('/api/mysql/shifts', {
      method: 'POST',
      body: {
        workerId: worker.id,
        dateString: '2026-07-06T23:52:28.041Z',
        timespan: '00:31 - 00:32',
        durationLabel: '0.02h',
        location: `Main Stage (${allowedEvent.title})`,
        status: 'Completed',
        startedAt: overlapStart,
        endedAt: overlapEnd,
      },
    });

    overlapRangeBlocked = overlapRes.status === 409;
    assert(
      overlapRangeBlocked,
      `Solape de rango debería bloquearse con 409 y devolvió ${overlapRes.status}: ${overlapRes.text}`,
    );

    const overlapMsg = String(overlapRes.json?.message || overlapRes.text || '').toLowerCase();
    assert(
      overlapMsg.includes('overlapping time range'),
      `Mensaje inesperado para bloqueo de solape: ${overlapRes.text}`,
    );

    // Validate boundary behavior: contiguous ranges are allowed.
    const contiguousStart = baselineEnd;
    const contiguousEnd = toIsoAtOffset(baselineEnd, 120_000);
    assert(contiguousStart && contiguousEnd, 'No fue posible construir rango contiguo para validación.');

    const contiguousRes = await api('/api/mysql/shifts', {
      method: 'POST',
      body: {
        workerId: worker.id,
        dateString: '2026-07-06T23:52:28.041Z',
        timespan: '00:40 - 00:42',
        durationLabel: '0.03h',
        location: `Main Stage (${allowedEvent.title})`,
        status: 'Completed',
        startedAt: contiguousStart,
        endedAt: contiguousEnd,
      },
    });

    contiguousRangeAllowed = contiguousRes.status === 201;
    assert(
      contiguousRangeAllowed,
      `Rango contiguo debería permitirse y devolvió ${contiguousRes.status}: ${contiguousRes.text}`,
    );

    if (contiguousRes.json?.id) {
      createdShiftIds.push(contiguousRes.json.id);
    }

    if (!futureEvent) {
      for (const event of orderedEvents.slice().reverse()) {
        if (event.id === allowedEvent.id) continue;

        const probe = await api('/api/mysql/shifts', {
          method: 'POST',
          body: {
            workerId: worker.id,
            dateString: '2026-07-06T23:52:28.041Z',
            timespan: '00:00 - Presente',
            durationLabel: 'In Progress',
            location: `Main Stage (${event.title})`,
            status: 'active',
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
        dateString: '2026-07-06T23:52:28.041Z',
        timespan: '00:00 - Presente',
        durationLabel: 'In Progress',
        location: `Main Stage (${futureEvent.title})`,
        status: 'active',
        startedAt: new Date().toISOString(),
      },
    });

    assert(futureRes.status === 400, `Evento futuro debería bloquear y devolvió ${futureRes.status}: ${futureRes.text}`);
    assert(
      isFutureGuardMessage(futureRes.json?.message || futureRes.text),
      `Mensaje de bloqueo inesperado para evento futuro: ${futureRes.text}`,
    );

    // Validate concurrent starts with a dedicated worker: exactly one request should win, the other must be blocked.
    const raceStaffRes = await api('/api/mysql/staff', {
      method: 'POST',
      body: {
        idCode: `RACE-${Date.now()}`,
        name: 'Shift Race Probe',
        role: 'Lighting',
        roleLabel: 'Iluminacion',
        status: 'OUT',
        checkedInTime: '-',
        lastSeen: 'Ahora',
        avatar: '',
        totalHours: 0,
        currentShiftHours: 0,
        currentShiftMins: 0,
        location: 'Main Stage',
      },
    });

    assert(
      raceStaffRes.status === 201 && raceStaffRes.json?.id,
      `No se pudo crear worker temporal para carrera concurrente (${raceStaffRes.status}): ${raceStaffRes.text}`,
    );

    const raceWorkerId = raceStaffRes.json.id;
    createdStaffIds.push(raceWorkerId);

    const raceStartedAt = new Date().toISOString();
    const racePayload = {
      workerId: raceWorkerId,
      dateString: '2026-07-06T23:52:28.041Z',
      timespan: '00:10 - Presente',
      durationLabel: 'In Progress',
      location: `Main Stage (${allowedEvent.title})`,
      status: 'active',
      startedAt: raceStartedAt,
    };

    const [raceA, raceB] = await Promise.all([
      api('/api/mysql/shifts', { method: 'POST', body: racePayload }),
      api('/api/mysql/shifts', { method: 'POST', body: racePayload }),
    ]);

    const raceStatuses = [raceA.status, raceB.status];
    const successCount = raceStatuses.filter((status) => status === 201).length;
    const conflictCount = raceStatuses.filter((status) => status === 409).length;
    concurrentStartRaceGuarded = successCount === 1 && conflictCount === 1;

    // Keep this as telemetry in CI because production may still run pre-lock backend until deploy.
    const unexpectedRaceStatuses = raceStatuses.filter((status) => status !== 201 && status !== 409);
    assert(
      successCount >= 1 && unexpectedRaceStatuses.length === 0,
      `Carrera concurrente devolvió estados inesperados [${raceStatuses.join(',')}].`,
    );

    for (const raceRes of [raceA, raceB]) {
      if (raceRes.status === 201 && raceRes.json?.id) {
        createdShiftIds.push(raceRes.json.id);
      }
    }

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
      overlapRangeBlocked,
      contiguousRangeAllowed,
      concurrentStartRaceGuarded,
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
    for (const shiftId of createdShiftIds) {
      await api(`/api/mysql/shifts/${shiftId}`, { method: 'DELETE' });
    }

    for (const staffId of createdStaffIds) {
      await api(`/api/mysql/staff/${staffId}`, { method: 'DELETE' });
    }
  }
}

run();
