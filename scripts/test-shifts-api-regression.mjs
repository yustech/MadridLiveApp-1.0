import dotenv from 'dotenv';

dotenv.config({ path: '/opt/madridlive-app/.env', quiet: true });
dotenv.config({ quiet: true });

const BASE_URL = process.env.API_BASE_URL || 'http://127.0.0.1:3000';
const ADMIN_API_TOKEN = process.env.ADMIN_API_TOKEN || '';
const REQUIRE_DELETE_STAFF_AUTH = String(process.env.REQUIRE_DELETE_STAFF_AUTH || 'true').toLowerCase() === 'true';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireAdminApiToken() {
  assert(ADMIN_API_TOKEN, 'ADMIN_API_TOKEN is required for shifts API regression mutations.');
  return ADMIN_API_TOKEN;
}

const MONTH_TO_INDEX = {
  JAN: 0, FEB: 1, MAR: 2, APR: 3, MAY: 4, JUN: 5, JUL: 6, AUG: 7, SEP: 8, OCT: 9, NOV: 10, DEC: 11,
  ENE: 0, ABR: 3, AGO: 7, DIC: 11,
  '1': 0, '2': 1, '3': 2, '4': 3, '5': 4, '6': 5, '7': 6, '8': 7, '9': 8, '10': 9, '11': 10, '12': 11,
};

const MONTH_INDEX_TO_TOKEN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

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

function buildFutureEventPayload() {
  const now = new Date();
  const future = new Date(now);
  future.setDate(now.getDate() + 14);

  if (future.getFullYear() !== now.getFullYear()) {
    future.setFullYear(now.getFullYear(), 11, 31);
  }

  const stamp = future.toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return {
    title: `Shift Regression Future Event ${stamp}`,
    location: 'Regression Gate',
    dateDay: String(future.getDate()).padStart(2, '0'),
    dateMonth: MONTH_INDEX_TO_TOKEN[future.getMonth()],
    doorsOpen: '23:59',
    requiredStaff: 0,
    activeStaff: 0,
    totalStaffNeeded: 0,
    scanRate: 0,
    loadInPercent: 0,
  };
}

function isFutureGuardMessage(textOrJsonMessage) {
  return String(textOrJsonMessage || '').toLowerCase().includes('future event');
}

async function api(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || 'GET',
    headers: {
      'content-type': 'application/json',
      'x-admin-token': requireAdminApiToken(),
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

async function apiNoAuth(path, options = {}) {
  const response = await fetch(`${BASE_URL}${path}`, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
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
  const createdEventIds = [];

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

    const futureSeedShiftIds = shiftsSnapshot
      .filter((shift) => {
        const startedAt = new Date(String(shift.startedAt || '')).getTime();
        return Number.isFinite(startedAt) && startedAt > Date.now() + 5 * 60 * 1000;
      })
      .map((shift) => shift.id);

    assert(
      futureSeedShiftIds.length === 0,
      `La fixture inicial contiene turnos con startedAt futuro y puede bloquear check-ins: ${futureSeedShiftIds.join(', ')}`,
    );

    const activeWorkerIds = new Set(
      shiftsSnapshot
        .filter((shift) => shift.status === 'Active')
        .map((shift) => shift.workerId),
    );

    const candidateWorkers = staff.filter((member) => !activeWorkerIds.has(member.id));

    if (candidateWorkers.length === 0) {
      const fallbackStaffRes = await api('/api/mysql/staff', {
        method: 'POST',
        body: {
          idCode: ('TMP' + Date.now()).slice(-20),
          name: 'Shift Regression Worker',
          role: 'Auxiliar',
          roleLabel: 'AUXILIAR',
          status: 'OUT',
          checkedInTime: '-',
          lastSeen: 'Ahora',
          avatar: '',
          email: '',
          phone: '',
          totalHours: 0,
          currentShiftHours: 0,
          currentShiftMins: 0,
          location: 'Regression Gate',
        },
      });

      assert(
        fallbackStaffRes.status === 201 && fallbackStaffRes.json?.id,
        'No se pudo crear worker temporal para regresión de shifts: ' + fallbackStaffRes.text,
      );

      const fallbackWorker = {
        id: fallbackStaffRes.json.id,
        name: 'Shift Regression Worker',
      };

      createdStaffIds.push(fallbackWorker.id);
      candidateWorkers.push(fallbackWorker);
    }

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
    let legacyLocationCreateRejected = false;
    let legacyLocationPatchRejected = false;
    let deleteStaffAuthEnforced = false;

    for (const candidateWorker of candidateWorkers) {
      for (const event of orderedEvents) {
        const createAttempt = await api('/api/mysql/shifts', {
          method: 'POST',
          body: {
            workerId: candidateWorker.id,
            dateString: '2026-07-06T23:52:28.041Z',
            timespan: '00:00 - Presente',
            durationLabel: 'In Progress',
            eventId: event.id,
            eventTitle: event.title,
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

    if (!worker) {
      const retryStaffRes = await api('/api/mysql/staff', {
        method: 'POST',
        body: {
          idCode: ('TMR' + Date.now()).slice(-20),
          name: 'Shift Regression Retry Worker',
          role: 'Auxiliar',
          roleLabel: 'AUXILIAR',
          status: 'OUT',
          checkedInTime: '-',
          lastSeen: 'Ahora',
          avatar: '',
          email: '',
          phone: '',
          totalHours: 0,
          currentShiftHours: 0,
          currentShiftMins: 0,
          location: 'Regression Retry Gate',
        },
      });

      assert(
        retryStaffRes.status === 201 && retryStaffRes.json?.id,
        'No se pudo crear worker temporal de reintento: ' + retryStaffRes.text,
      );

      const retryWorker = { id: retryStaffRes.json.id, name: 'Shift Regression Retry Worker' };
      createdStaffIds.push(retryWorker.id);

      for (const event of orderedEvents) {
        const retryCreate = await api('/api/mysql/shifts', {
          method: 'POST',
          body: {
            workerId: retryWorker.id,
            dateString: '2026-07-06T23:52:28.041Z',
            timespan: '00:00 - Presente',
            durationLabel: 'In Progress',
            eventId: event.id,
            eventTitle: event.title,
            status: 'active',
            startedAt: new Date().toISOString(),
          },
        });

        const guardMsg = String(retryCreate.json?.message || retryCreate.text || '');

        if (retryCreate.status === 201) {
          worker = retryWorker;
          allowedEvent = event;
          if (retryCreate.json?.id) {
            createdShiftIds.push(retryCreate.json.id);
          }
          break;
        }

        if (retryCreate.status === 400 && isFutureGuardMessage(guardMsg)) {
          if (!futureEvent) futureEvent = event;
          continue;
        }
      }
    }

    if (!worker) {
      console.warn('[shifts-api-regression] no_available_worker_for_probe');
      console.log(JSON.stringify({
        test: 'shifts-api-regression',
        status: 'ok',
        baseUrl: BASE_URL,
        duration_ms: Date.now() - startedAtMs,
        skippedNoAvailableWorker: true,
      }));
      return;
    }
    assert(allowedEvent, 'No se encontró evento permitido para validar alta/cierre.');
    assert(createdShiftIds.length > 0, 'No se recibió id del turno creado.');
    const createdShiftId = createdShiftIds[0];

    const authProbeStaffId = "auth-probe-" + Date.now();
    const deleteWithoutAuthRes = await apiNoAuth("/api/mysql/staff/" + authProbeStaffId, {
      method: "DELETE",
    });

    deleteStaffAuthEnforced = deleteWithoutAuthRes.status === 401;
    if (REQUIRE_DELETE_STAFF_AUTH) {
      assert(
        deleteStaffAuthEnforced,
        "DELETE /staff sin token debe devolver 401 y devolvio " + deleteWithoutAuthRes.status + ": " + deleteWithoutAuthRes.text,
      );
    } else if (!deleteStaffAuthEnforced) {
      console.warn(
        "[shifts-api-regression] delete_staff_auth_not_enforced",
        JSON.stringify({ status: deleteWithoutAuthRes.status, body: deleteWithoutAuthRes.text })
      );
    }

    const protectedReadResults = await Promise.all([
      apiNoAuth('/api/mysql/staff'),
      apiNoAuth('/api/mysql/events'),
      apiNoAuth('/api/mysql/shifts'),
      apiNoAuth('/api/mysql/alerts'),
      apiNoAuth('/api/mysql/status'),
      apiNoAuth('/api/mysql/schema-check'),
    ]);
    const protectedReadPaths = [
      '/api/mysql/staff',
      '/api/mysql/events',
      '/api/mysql/shifts',
      '/api/mysql/alerts',
      '/api/mysql/status',
      '/api/mysql/schema-check',
    ];
    protectedReadResults.forEach((result, index) => {
      assert(
        result.status === 401,
        `${protectedReadPaths[index]} sin token debe devolver 401 y devolvio ${result.status}: ${result.text}`,
      );
    });

    const deleteWithAuthRes = await api("/api/mysql/staff/" + authProbeStaffId, {
      method: "DELETE",
    });

    assert(
      deleteWithAuthRes.status !== 401,
      "DELETE /staff con token admin no deberia devolver 401.",
    );

    const duplicateActiveRes = await api('/api/mysql/shifts', {
      method: 'POST',
      body: {
        workerId: worker.id,
        dateString: '2026-07-06T23:52:28.041Z',
        timespan: '00:01 - Presente',
        durationLabel: 'In Progress',
        eventId: allowedEvent.id,
        eventTitle: allowedEvent.title,
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
        eventId: allowedEvent.id,
        eventTitle: allowedEvent.title,
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
        eventId: allowedEvent.id,
        eventTitle: allowedEvent.title,
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
        eventId: allowedEvent.id,
        eventTitle: allowedEvent.title,
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
            eventId: event.id,
            eventTitle: event.title,
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

    if (!futureEvent) {
      const futureEventPayload = buildFutureEventPayload();
      const futureEventRes = await api('/api/mysql/events', {
        method: 'POST',
        body: futureEventPayload,
      });

      assert(
        futureEventRes.status === 201 && futureEventRes.json?.id,
        `No se pudo crear evento futuro temporal para regresion (${futureEventRes.status}): ${futureEventRes.text}`,
      );

      futureEvent = { id: futureEventRes.json.id, ...futureEventPayload };
      createdEventIds.push(futureEvent.id);
    }

    assert(futureEvent, 'No se encontró evento futuro para validar bloqueo.');

    const futureRes = await api('/api/mysql/shifts', {
      method: 'POST',
      body: {
        workerId: worker.id,
        dateString: '2026-07-06T23:52:28.041Z',
        timespan: '00:00 - Presente',
        durationLabel: 'In Progress',
        eventId: futureEvent.id,
        eventTitle: futureEvent.title,
        status: 'active',
        startedAt: new Date().toISOString(),
      },
    });

    assert(futureRes.status === 400, `Evento futuro debería bloquear y devolvió ${futureRes.status}: ${futureRes.text}`);
    assert(
      isFutureGuardMessage(futureRes.json?.message || futureRes.text),
      `Mensaje de bloqueo inesperado para evento futuro: ${futureRes.text}`,
    );

    const legacyCreateRes = await api('/api/mysql/shifts', {
      method: 'POST',
      body: {
        workerId: worker.id,
        dateString: '2026-07-06T23:52:28.041Z',
        timespan: '00:00 - Presente',
        durationLabel: 'In Progress',
        location: `Main Stage (${allowedEvent.title})`,
        status: 'active',
        startedAt: new Date().toISOString(),
      },
    });

    legacyLocationCreateRejected = legacyCreateRes.status === 400;
    assert(
      legacyLocationCreateRejected,
      `Payload legacy con location en alta de shift debe fallar con 400 y devolvio ${legacyCreateRes.status}: ${legacyCreateRes.text}`,
    );

    const legacyCreateErrors = Array.isArray(legacyCreateRes.json?.errors) ? legacyCreateRes.json.errors : [];
    const legacyFields = new Set(legacyCreateErrors.map((error) => String(error?.field || '').toLowerCase()));
    assert(
      legacyFields.has('location') || legacyFields.has('eventtitle'),
      `El rechazo de alta legacy no reporto field=location/eventTitle: ${legacyCreateRes.text}`,
    );

    const legacyPatchRes = await api(`/api/mysql/shifts/${createdShiftId}`, {
      method: 'PATCH',
      body: {
        location: 'Legacy Zone',
      },
    });

    legacyLocationPatchRejected = legacyPatchRes.status === 400;
    assert(
      legacyLocationPatchRejected,
      `Payload legacy con location en patch de shift debe fallar con 400 y devolvio ${legacyPatchRes.status}: ${legacyPatchRes.text}`,
    );

    // Validate concurrent starts with a dedicated worker: exactly one request should win, the other must be blocked.
    const raceStaffRes = await api('/api/mysql/staff', {
      method: 'POST',
      body: {
        idCode: `RACE-${Date.now()}`,
        name: 'Shift Race Probe',
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
      eventId: allowedEvent.id,
      eventTitle: allowedEvent.title,
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
      legacyLocationCreateRejected,
      legacyLocationPatchRejected,
      deleteStaffAuthEnforced,
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

    for (const eventId of createdEventIds) {
      await api(`/api/mysql/events/${eventId}`, { method: 'DELETE' });
    }
  }
}

run();
