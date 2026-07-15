import express from "express";
import { INITIAL_ALERTS, INITIAL_EVENTS, INITIAL_SHIFTS, INITIAL_STAFF } from "./src/data";
import {
  validateAlertPatchPayload,
  validateAlertPayload,
  validateEventPatchPayload,
  validateEventPayload,
  validateShiftPatchPayload,
  validateShiftPayload,
  validateStaffPatchPayload,
  validateStaffPayload,
} from "./src/validators";
import { formatClockLabel, toMysqlDateTimeValue } from "./server/mysql/dateTime";
import { makeId } from "./server/mysql/ids";
import {
  getOptionalPayloadString,
  getRequiredPayloadString,
  normalizeCheckInLocation,
} from "./server/mysql/payload";
import { isAdminAuthorized, unauthorizedResponse } from "./server/mysql/auth";
import { getPool, isMysqlConfigured } from "./server/mysql/pool";
import { insertAlertRecord } from "./server/mysql/repositories/alertsRepository";
import { buildEventUpdatePayload, insertEventRecord } from "./server/mysql/repositories/eventsRepository";
import { insertShiftRecord, selectPublicShiftById } from "./server/mysql/repositories/shiftsRepository";
import { insertStaffRecord, selectPublicStaffById } from "./server/mysql/repositories/staffRepository";
import { makeRouteError } from "./server/mysql/routeErrors";
import { initSchema } from "./server/mysql/schema/initSchema";
import { applySchemaMigrations } from "./server/mysql/schema/legacyMigrations";
import { getSchemaStatus } from "./server/mysql/schema/schemaStatus";
import { buildUpdateClause } from "./server/mysql/updateClause";

const MYSQL_PREFIX = "/api/mysql";

interface MysqlApiOptions {
  isAdminAuthorized?: (req: express.Request) => boolean;
}

function parseCount(value: unknown) {
  const count = Number(value ?? 0);
  return Number.isFinite(count) ? count : 0;
}

function formatSeedClock(date: Date) {
  return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
}

function getSeedClockParts(timespan: string) {
  const match = timespan.match(/(\d{1,2}):(\d{2})/);
  return {
    hour: match ? Number(match[1]) : 10,
    minute: match ? Number(match[2]) : 0,
  };
}

function buildSeedCompletedStart(timespan: string, daysAgo: number) {
  const { hour, minute } = getSeedClockParts(timespan);
  const startedAt = new Date();
  startedAt.setDate(startedAt.getDate() - daysAgo);
  startedAt.setHours(Number.isFinite(hour) ? hour : 10, Number.isFinite(minute) ? minute : 0, 0, 0);
  return startedAt;
}

function buildSeedActiveStart(index: number) {
  const startedAt = new Date(Date.now() - (90 + index * 20) * 60 * 1000);
  startedAt.setSeconds(0, 0);
  return startedAt;
}

function normalizeInitialShiftForSeed(shift: (typeof INITIAL_SHIFTS)[number], index: number) {
  const isActive = shift.status === 'Active';
  const parsedStartedAt = shift.startedAt ? new Date(shift.startedAt) : null;
  const startedAtDate = parsedStartedAt && !Number.isNaN(parsedStartedAt.getTime())
    ? parsedStartedAt
    : isActive
      ? buildSeedActiveStart(index)
      : buildSeedCompletedStart(shift.timespan, index + 1);
  const endedAtDate = isActive
    ? null
    : shift.endedAt
      ? new Date(shift.endedAt)
      : new Date(startedAtDate.getTime() + 2 * 60 * 60 * 1000);
  const endedAt = endedAtDate && !Number.isNaN(endedAtDate.getTime())
    ? endedAtDate.toISOString()
    : null;
  const event = INITIAL_EVENTS.find((candidate) => candidate.title === shift.eventTitle);
  const startLabel = formatSeedClock(startedAtDate);
  const endLabel = endedAtDate && !Number.isNaN(endedAtDate.getTime())
    ? formatSeedClock(endedAtDate)
    : 'Presente';

  return {
    ...shift,
    dateString: startedAtDate.toISOString(),
    eventId: shift.eventId || event?.id,
    timespan: `${startLabel} - ${isActive ? 'Presente' : endLabel}`,
    startedAt: startedAtDate.toISOString(),
    endedAt,
  };
}

function normalizeInitialStaffForSeed(
  staff: (typeof INITIAL_STAFF)[number],
  normalizedShifts: ReturnType<typeof normalizeInitialShiftForSeed>[]
) {
  const activeShift = normalizedShifts.find((shift) => shift.workerId === staff.id && shift.status === 'Active');
  if (activeShift) {
    return {
      ...staff,
      status: 'IN' as const,
      checkedInTime: activeShift.startedAt,
    };
  }

  return {
    ...staff,
    status: 'OUT' as const,
    checkedInTime: '',
    currentShiftHours: 0,
    currentShiftMins: 0,
  };
}

async function resetInitialData() {
  const db = getPool();
  await initSchema(db);
  await applySchemaMigrations(db);
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM shifts');
    await conn.query('DELETE FROM alerts');
    await conn.query('DELETE FROM events');
    await conn.query('DELETE FROM staff');

    const normalizedInitialShifts = INITIAL_SHIFTS.map(normalizeInitialShiftForSeed);

    for (const staff of INITIAL_STAFF) {
      const validation = validateStaffPayload(normalizeInitialStaffForSeed(staff, normalizedInitialShifts));
      if (!validation.valid) {
        throw new Error(`Initial staff seed failed validation: ${validation.errors.map((error) => error.field).join(', ')}`);
      }
      await insertStaffRecord(conn, staff.id, validation.sanitized!);
    }

    for (const event of INITIAL_EVENTS) {
      const validation = validateEventPayload(event);
      if (!validation.valid) {
        throw new Error(`Initial event seed failed validation: ${validation.errors.map((error) => error.field).join(', ')}`);
      }
      await insertEventRecord(conn, event.id, validation.sanitized!, event.location);
    }

    for (const alert of INITIAL_ALERTS) {
      const validation = validateAlertPayload(alert);
      if (!validation.valid) {
        throw new Error(`Initial alert seed failed validation: ${validation.errors.map((error) => error.field).join(', ')}`);
      }
      await insertAlertRecord(conn, alert.id, validation.sanitized!);
    }

    for (const shift of normalizedInitialShifts) {
      const validation = validateShiftPayload(shift);
      if (!validation.valid) {
        throw new Error(`Initial shift seed failed validation: ${validation.errors.map((error) => error.field).join(', ')}`);
      }
      await insertShiftRecord(conn, shift.id, validation.sanitized!);
    }

    await conn.commit();
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // Keep the original reset failure.
    }
    throw error;
  } finally {
    conn.release();
  }
}

const MONTH_INDEX: Record<string, number> = {
  ENE: 0,
  JAN: 0,
  FEB: 1,
  MAR: 2,
  ABR: 3,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AGO: 7,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DIC: 11,
  DEC: 11,
};

function parseEventDateTime(dateDay?: string, dateMonth?: string, dateYear?: string, doorsOpen?: string) {
  const day = Number(String(dateDay || '').trim());
  const monthToken = String(dateMonth || '').trim().toUpperCase();
  const month = MONTH_INDEX[monthToken];
  const parsedYear = Number(String(dateYear || '').trim());
  const year = Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200
    ? parsedYear
    : new Date().getFullYear();

  if (!Number.isInteger(day) || day < 1 || day > 31 || month === undefined) {
    return null;
  }

  const [hourRaw, minRaw] = String(doorsOpen || '00:00').split(':');
  const hour = Number(hourRaw);
  const minute = Number(minRaw);
  const eventDate = new Date(
    year,
    month,
    day,
    Number.isFinite(hour) ? hour : 0,
    Number.isFinite(minute) ? minute : 0,
    0,
    0
  );

  if (Number.isNaN(eventDate.getTime())) {
    return null;
  }

  return eventDate;
}

async function ensureShiftNotLinkedToFutureEvent(db: any, status: unknown, eventId: unknown, eventTitle: unknown) {
  if (String(status || '').toLowerCase() !== 'active') {
    return;
  }

  const eventIdStr = String(eventId || '').trim();
  const eventTitleStr = String(eventTitle || '').trim();
  if (!eventIdStr && !eventTitleStr) {
    return;
  }

  let rows: any[] = [];
  if (eventIdStr) {
    [rows] = await db.query(
      `SELECT id, title, dateDay AS dateDay, dateMonth AS dateMonth, dateYear AS dateYear, doorsOpen AS doorsOpen
       FROM events
       WHERE id = ?
       LIMIT 1`,
      [eventIdStr]
    );
  } else {
    [rows] = await db.query(
      `SELECT id, title, dateDay AS dateDay, dateMonth AS dateMonth, dateYear AS dateYear, doorsOpen AS doorsOpen
       FROM events
       WHERE title = ?
       LIMIT 1`,
      [eventTitleStr]
    );
  }

  const event = rows?.[0];
  if (!event) {
    return;
  }

  const eventDate = parseEventDateTime(event.dateDay, event.dateMonth, event.dateYear, event.doorsOpen);
  if (!eventDate) {
    return;
  }

  // Allow check-ins for events happening today, even if doorsOpen is later.
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const eventDayStart = new Date(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate()
  ).getTime();

  if (eventDayStart > todayStart) {
    throw new Error(`Cannot activate shifts for future event: ${event.title} (${event.dateDay} ${event.dateMonth} ${eventDate.getFullYear()}).`);
  }
}


async function ensureWorkerShiftTimeIntegrity(
  db: any,
  workerId: unknown,
  status: unknown,
  startedAt: unknown,
  endedAt: unknown,
  excludeShiftId?: string
) {
  const workerIdStr = String(workerId || '').trim();
  if (!workerIdStr) return;

  const isActivating = String(status || '').toLowerCase() === 'active';
  const startedAtMysql = startedAt === undefined ? null : toMysqlDateTimeValue(startedAt);
  const endedAtMysql = endedAt === undefined ? null : toMysqlDateTimeValue(endedAt);
  const excludedId = excludeShiftId || '__NO_EXCLUDED_SHIFT__';

  if (isActivating) {
    const [activeRows] = await db.query(
      `SELECT id
       FROM shifts
       WHERE worker_id = ?
         AND status = 'Active'
         AND id <> ?
       LIMIT 1`,
      [workerIdStr, excludedId]
    );

    if (activeRows?.[0]) {
      throw new Error('Shift conflict: worker already has an active shift.');
    }
  }

  // Overlap checks require a normalized start timestamp.
  if (!startedAtMysql) {
    return;
  }

  const [overlapRows] = await db.query(
    `SELECT id
     FROM shifts
     WHERE worker_id = ?
       AND id <> ?
       AND started_at IS NOT NULL
       AND (? IS NULL OR started_at < ?)
       AND COALESCE(ended_at, '9999-12-31 23:59:59') > ?
     LIMIT 1`,
    [workerIdStr, excludedId, endedAtMysql, endedAtMysql, startedAtMysql]
  );

  if (overlapRows?.[0]) {
    throw new Error('Shift conflict: overlapping time range for worker.');
  }
}

async function performWorkerCheckIn(conn: any, body: Record<string, unknown>) {
  const workerId = getRequiredPayloadString(body, "workerId", 96);
  const eventId = getRequiredPayloadString(body, "eventId", 96);
  const location = normalizeCheckInLocation(body.location);
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMysql = toMysqlDateTimeValue(nowIso);
  const shiftId = makeId("sh");

  const [staffRows] = await conn.query(
    `SELECT id, COALESCE(location, '') AS location
     FROM staff
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [workerId]
  );
  const staffRow = Array.isArray(staffRows) ? staffRows[0] : null;
  if (!staffRow) {
    throw makeRouteError(404, "Worker not found.");
  }

  const [eventRows] = await conn.query(
    `SELECT id, title
     FROM events
     WHERE id = ?
     LIMIT 1`,
    [eventId]
  );
  const eventRow = Array.isArray(eventRows) ? eventRows[0] : null;
  if (!eventRow) {
    throw makeRouteError(404, "Event not found.");
  }

  const [activeRows] = await conn.query(
    `SELECT id
     FROM shifts
     WHERE worker_id = ?
       AND status = 'Active'
     ORDER BY started_at DESC, updated_at DESC
     LIMIT 1
     FOR UPDATE`,
    [workerId]
  );
  if (Array.isArray(activeRows) && activeRows[0]) {
    throw makeRouteError(409, "Shift conflict: worker already has an active shift.");
  }

  await ensureShiftNotLinkedToFutureEvent(conn, "Active", eventId, eventRow.title);
  await ensureWorkerShiftTimeIntegrity(conn, workerId, "Active", nowIso, null);

  await conn.execute(
    `
      INSERT INTO shifts (
        id, worker_id, date_string, timespan, duration_label, event_id, event_title, status, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      shiftId,
      workerId,
      nowIso,
      `${formatClockLabel(now)} - Presente`,
      "Active",
      eventId,
      eventRow.title,
      "Active",
      nowMysql,
      null,
    ]
  );

  await conn.execute(
    `UPDATE staff
     SET status = 'IN',
         checkedInTime = ?,
         currentShiftHours = 0,
         currentShiftMins = 0,
         location = ?
     WHERE id = ?`,
    [nowIso, location || staffRow.location || null, workerId]
  );

  const staff = await selectPublicStaffById(conn, workerId);
  const shift = await selectPublicShiftById(conn, shiftId);

  return { action: "checkin", staff, shift };
}

async function performWorkerCheckOut(conn: any, body: Record<string, unknown>) {
  const workerId = getRequiredPayloadString(body, "workerId", 96);
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMysql = toMysqlDateTimeValue(nowIso);
  const nowLabel = formatClockLabel(now);

  const [staffRows] = await conn.query(
    `SELECT id, CAST(totalHours AS DOUBLE) AS totalHours
     FROM staff
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [workerId]
  );
  const staffRow = Array.isArray(staffRows) ? staffRows[0] : null;
  if (!staffRow) {
    throw makeRouteError(404, "Worker not found.");
  }

  const [activeRows] = await conn.query(
    `SELECT id, timespan, started_at AS startedAt
     FROM shifts
     WHERE worker_id = ?
       AND status = 'Active'
     ORDER BY started_at DESC, updated_at DESC
     LIMIT 1
     FOR UPDATE`,
    [workerId]
  );
  const activeShift = Array.isArray(activeRows) ? activeRows[0] : null;
  if (!activeShift) {
    throw makeRouteError(409, "Shift conflict: worker has no active shift to close.");
  }

  const startedAtDate = activeShift.startedAt ? new Date(activeShift.startedAt) : now;
  const startTs = startedAtDate.getTime();
  const endTs = now.getTime();
  const elapsedMs = Number.isFinite(startTs) && endTs > startTs ? endTs - startTs : 0;
  const netAccruedHours = elapsedMs / (1000 * 60 * 60);
  const finalHours = Number((Number(staffRow.totalHours || 0) + netAccruedHours).toFixed(2));
  const startLabel = String(activeShift.timespan || "").split(" - ")[0] || formatClockLabel(startedAtDate);

  await conn.execute(
    `UPDATE shifts
     SET status = 'Completed',
         timespan = ?,
         duration_label = ?,
         ended_at = ?
     WHERE id = ?`,
    [
      `${startLabel} - ${nowLabel}`,
      `${netAccruedHours.toFixed(1)}h`,
      nowMysql,
      activeShift.id,
    ]
  );

  await conn.execute(
    `UPDATE staff
     SET status = 'OUT',
         checkedInTime = NULL,
         lastSeen = ?,
         currentShiftHours = 0,
         currentShiftMins = 0,
         totalHours = ?
     WHERE id = ?`,
    [nowIso, finalHours, workerId]
  );

  const staff = await selectPublicStaffById(conn, workerId);
  const shift = await selectPublicShiftById(conn, activeShift.id);

  return { action: "checkout", staff, shift };
}

export function registerMysqlApi(app: express.Express, options: MysqlApiOptions = {}) {
  const isAuthorized = (req: express.Request) => options.isAdminAuthorized
    ? options.isAdminAuthorized(req)
    : isAdminAuthorized(req);

  const requireAuthorizedRead = (req: express.Request, res: express.Response) => {
    if (isAuthorized(req)) return true;
    unauthorizedResponse(res);
    return false;
  };

  app.get(`${MYSQL_PREFIX}/health-count`, async (_req, res) => {
    if (!isMysqlConfigured()) {
      return res.status(503).json({
        success: false,
        configured: false,
        message: "MySQL is not configured in environment variables.",
      });
    }

    try {
      const db = getPool();
      const [rows] = await db.query(`
        SELECT
          (SELECT COUNT(*) FROM staff) AS staffCount,
          (SELECT COUNT(*) FROM events) AS eventsCount,
          (SELECT COUNT(*) FROM shifts) AS shiftsCount,
          (SELECT COUNT(*) FROM alerts) AS alertsCount
      `);
      const row = (Array.isArray(rows) ? rows[0] : {}) as Record<string, unknown>;
      const counts = {
        staff: parseCount(row.staffCount),
        events: parseCount(row.eventsCount),
        shifts: parseCount(row.shiftsCount),
        alerts: parseCount(row.alertsCount),
      };
      const status = await getSchemaStatus(db);

      return res.json({
        success: status.ok,
        configured: true,
        counts,
        staffCount: counts.staff,
        required: status.required,
        missing: status.missing,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, configured: true, message: error.message });
    }
  });

  app.get(`${MYSQL_PREFIX}/status`, async (req, res) => {
    if (!requireAuthorizedRead(req, res)) return;

    if (!isMysqlConfigured()) {
      return res.status(503).json({
        success: false,
        configured: false,
        message: "MySQL is not configured in environment variables.",
      });
    }

    try {
      const db = getPool();
      const [rows] = await db.query("SELECT 1 AS ok");
      return res.json({ success: true, configured: true, ok: rows[0]?.ok === 1 });
    } catch (error: any) {
      return res.status(500).json({ success: false, configured: true, message: error.message });
    }
  });

  app.get(`${MYSQL_PREFIX}/schema-check`, async (req, res) => {
    if (!requireAuthorizedRead(req, res)) return;

    if (!isMysqlConfigured()) {
      return res.status(503).json({
        success: false,
        configured: false,
        message: 'MySQL is not configured in environment variables.',
      });
    }

    try {
      const db = getPool();
      const status = await getSchemaStatus(db);
      return res.json({
        success: status.ok,
        configured: true,
        required: status.required,
        missing: status.missing,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, configured: true, message: error.message });
    }
  });

  app.post(`${MYSQL_PREFIX}/schema-migrate`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const db = getPool();
      await initSchema(db);
      const result = await applySchemaMigrations(db);
      const status = await getSchemaStatus(db);
      return res.json({
        success: status.ok,
        migrated: result.migrated,
        required: status.required,
        missing: status.missing,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });


  app.post(`${MYSQL_PREFIX}/init`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const db = getPool();
      await initSchema(db);
      await applySchemaMigrations(db);
      return res.json({ success: true, message: "MySQL schema initialized." });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post(`${MYSQL_PREFIX}/reset-initial`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      await resetInitialData();
      return res.json({ success: true, message: "MySQL data reset to initial dataset." });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.post(`${MYSQL_PREFIX}/checkin`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    let conn: any = null;
    try {
      const db = getPool();
      conn = await db.getConnection();
      await conn.beginTransaction();

      const result = await performWorkerCheckIn(conn, req.body || {});

      await conn.commit();
      return res.status(201).json({ success: true, ...result });
    } catch (error: any) {
      if (conn) {
        try {
          await conn.rollback();
        } catch {
          // Keep the original check-in failure.
        }
      }
      const message = error?.message || "Check-in failed.";
      if (message.startsWith("Cannot activate shifts for future event")) {
        return res.status(400).json({ success: false, message });
      }
      return res.status(error?.statusCode || 500).json({ success: false, message });
    } finally {
      if (conn) {
        conn.release();
      }
    }
  });

  app.post(`${MYSQL_PREFIX}/checkout`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    let conn: any = null;
    try {
      const db = getPool();
      conn = await db.getConnection();
      await conn.beginTransaction();

      const result = await performWorkerCheckOut(conn, req.body || {});

      await conn.commit();
      return res.json({ success: true, ...result });
    } catch (error: any) {
      if (conn) {
        try {
          await conn.rollback();
        } catch {
          // Keep the original check-out failure.
        }
      }
      const message = error?.message || "Check-out failed.";
      return res.status(error?.statusCode || 500).json({ success: false, message });
    } finally {
      if (conn) {
        conn.release();
      }
    }
  });

  app.get(`${MYSQL_PREFIX}/staff`, async (req, res) => {
    if (!requireAuthorizedRead(req, res)) return;

    try {
      const db = getPool();
      const [rows] = await db.query(`
        SELECT
          st.id,
          st.idCode AS idCode,
          st.name,
          st.role,
          st.roleLabel AS roleLabel,
          CASE WHEN active.worker_id IS NOT NULL THEN 'IN' ELSE 'OUT' END AS status,
          CASE WHEN active.worker_id IS NOT NULL THEN st.checkedInTime ELSE '' END AS checkedInTime,
          st.lastSeen AS lastSeen,
          st.avatar,
          COALESCE(st.email, '') AS email,
          COALESCE(st.phone, '') AS phone,
          CAST(st.totalHours AS DOUBLE) AS totalHours,
          CASE WHEN active.worker_id IS NOT NULL THEN st.currentShiftHours ELSE 0 END AS currentShiftHours,
          CASE WHEN active.worker_id IS NOT NULL THEN st.currentShiftMins ELSE 0 END AS currentShiftMins,
          COALESCE(st.location, '') AS location
        FROM staff st
        LEFT JOIN (
          SELECT worker_id
          FROM shifts
          WHERE status = 'Active'
          GROUP BY worker_id
        ) active ON active.worker_id = st.id
        ORDER BY st.name ASC
      `);
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(`${MYSQL_PREFIX}/staff`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const body = req.body || {};

      // Validate and sanitize input
      const validation = validateStaffPayload(body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Input validation failed",
          errors: validation.errors,
        });
      }

      const sanitized = validation.sanitized!;
      const id = makeId("usr");
      const db = getPool();
      await insertStaffRecord(db, id, sanitized);

      return res.status(201).json({ id });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(`${MYSQL_PREFIX}/staff/:id`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    const allowed = [
      "idCode",
      "name",
      "role",
      "roleLabel",
      "status",
      "checkedInTime",
      "lastSeen",
      "avatar",
      "email",
      "phone",
      "totalHours",
      "currentShiftHours",
      "currentShiftMins",
      "location",
    ];

    const validation = validateStaffPatchPayload(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Input validation failed",
        errors: validation.errors,
      });
    }

    const dbPayload = validation.sanitized || {};

    const { clause, values } = buildUpdateClause(dbPayload, allowed);
    if (!clause) {
      return res.status(400).json({ message: "No valid fields to update." });
    }

    try {
      const db = getPool();
      await db.execute(`UPDATE staff SET ${clause} WHERE id = ?`, [...values, req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete(`${MYSQL_PREFIX}/staff/:id`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const db = getPool();
      await db.execute("DELETE FROM staff WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(`${MYSQL_PREFIX}/events`, async (req, res) => {
    if (!requireAuthorizedRead(req, res)) return;

    try {
      const db = getPool();
      const [rows] = await db.query(`
        SELECT
          id,
          title,
          location,
          dateDay AS dateDay,
          dateMonth AS dateMonth,
          COALESCE(dateYear, CAST(YEAR(CURRENT_DATE()) AS CHAR)) AS dateYear,
          doorsOpen AS doorsOpen,
          required_staff AS requiredStaff,
          active_staff AS activeStaff,
          total_staff_needed AS totalStaffNeeded,
          scan_rate AS scanRate,
          load_in_percent AS loadInPercent
        FROM events
      `);
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(`${MYSQL_PREFIX}/events`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const body = req.body || {};
      
      // Validate and sanitize input
      const validation = validateEventPayload(body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Input validation failed",
          errors: validation.errors,
        });
      }

      const sanitized = validation.sanitized!;
      const id = makeId("ev");
      const db = getPool();
      await insertEventRecord(db, id, sanitized, body.location);
      return res.status(201).json({ id });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(`${MYSQL_PREFIX}/events/:id`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    const allowed = [
      "title",
      "location",
      "dateDay",
      "date_day",
      "dateMonth",
      "date_month",
      "dateYear",
      "date_year",
      "doorsOpen",
      "doors_open",
      "requiredStaff",
      "required_staff",
      "activeStaff",
      "active_staff",
      "totalStaffNeeded",
      "total_staff_needed",
      "scanRate",
      "scan_rate",
      "loadInPercent",
      "load_in_percent",
    ];

    const validation = validateEventPatchPayload(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Input validation failed",
        errors: validation.errors,
      });
    }

    try {
      const db = getPool();
      const dbPayload = await buildEventUpdatePayload(db, validation.sanitized || {});
      const { clause, values } = buildUpdateClause(dbPayload, allowed);
      if (!clause) {
        return res.status(400).json({ message: "No valid fields to update." });
      }

      await db.execute(`UPDATE events SET ${clause} WHERE id = ?`, [...values, req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete(`${MYSQL_PREFIX}/events/:id`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const db = getPool();
      const [rows] = await db.query(
        `SELECT id, title FROM events WHERE id = ? LIMIT 1`,
        [req.params.id]
      );
      const eventRows = rows as Array<{ id: string; title: string }>;
      if (eventRows.length === 0) {
        return res.status(404).json({ message: 'Event not found' });
      }

      const eventTitle = eventRows[0].title;
      await db.execute(
        `DELETE FROM shifts WHERE event_id = ? OR event_title = ?`,
        [req.params.id, eventTitle]
      );
      await db.execute("DELETE FROM events WHERE id = ?", [req.params.id]);

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(`${MYSQL_PREFIX}/shifts`, async (req, res) => {
    if (!requireAuthorizedRead(req, res)) return;

    try {
      const db = getPool();
      const [rows] = await db.query(`
        SELECT
          id,
          worker_id AS workerId,
          date_string AS dateString,
          timespan,
          duration_label AS durationLabel,
          event_id AS eventId,
          event_title AS eventTitle,
          status,
          started_at AS startedAt,
          ended_at AS endedAt,
          updated_at AS updatedAt
        FROM shifts
        ORDER BY id DESC
      `);
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(`${MYSQL_PREFIX}/shifts`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    let conn: any = null;
    try {
      const body = req.body || {};
      
      // Validate and sanitize input
      const validation = validateShiftPayload(body);
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Input validation failed",
          errors: validation.errors,
        });
      }

      const sanitized = validation.sanitized!;
      const id = makeId("sh");
      const db = getPool();

      const startedAtMysql = toMysqlDateTimeValue(sanitized.startedAt);
      const endedAtMysql = toMysqlDateTimeValue(sanitized.endedAt);

      conn = await db.getConnection();
      await conn.beginTransaction();

      // Serialize writes per worker to avoid races between integrity checks and insertions.
      await conn.query(`SELECT id FROM staff WHERE id = ? LIMIT 1 FOR UPDATE`, [sanitized.workerId]);

      await ensureShiftNotLinkedToFutureEvent(conn, sanitized.status, sanitized.eventId, sanitized.eventTitle);
      await ensureWorkerShiftTimeIntegrity(
        conn,
        sanitized.workerId,
        sanitized.status,
        startedAtMysql,
        endedAtMysql
      );

      await conn.execute(
        `
          INSERT INTO shifts (
            id, worker_id, date_string, timespan, duration_label, event_id, event_title, status, started_at, ended_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          sanitized.workerId,
          sanitized.dateString,
          sanitized.timespan,
          sanitized.durationLabel,
          sanitized.eventId || null,
          sanitized.eventTitle,
          sanitized.status,
          startedAtMysql,
          endedAtMysql,
        ]
      );

      await conn.commit();
      return res.status(201).json({ id });
    } catch (error: any) {
      if (conn) {
        try {
          await conn.rollback();
        } catch {
          // Ignore rollback errors and keep original failure response.
        }
      }
      const message = error?.message || "Shift creation failed.";
      if (message.startsWith("Cannot activate shifts for future event")) {
        return res.status(400).json({ message });
      }
      if (message.startsWith('Shift conflict:')) {
        return res.status(409).json({ message });
      }
      return res.status(500).json({ message });
    } finally {
      if (conn) {
        conn.release();
      }
    }
  });

  app.patch(`${MYSQL_PREFIX}/shifts/:id`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    const allowed = ["worker_id", "date_string", "timespan", "duration_label", "event_id", "event_title", "status", "started_at", "ended_at"];

    const validation = validateShiftPatchPayload(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Input validation failed",
        errors: validation.errors,
      });
    }

    const sanitized = validation.sanitized || {};
    const hasSanitizedField = (key: string) => Object.prototype.hasOwnProperty.call(sanitized, key);
    const dbPayload: Record<string, unknown> = {
      worker_id: sanitized.workerId,
      date_string: sanitized.dateString,
      timespan: sanitized.timespan,
      duration_label: sanitized.durationLabel,
      event_id: hasSanitizedField('eventId') ? sanitized.eventId : undefined,
      event_title: sanitized.eventTitle,
      status: sanitized.status,
      started_at: hasSanitizedField('startedAt') ? toMysqlDateTimeValue(sanitized.startedAt) : undefined,
      ended_at: hasSanitizedField('endedAt') ? toMysqlDateTimeValue(sanitized.endedAt) : undefined,
    };

    Object.keys(dbPayload).forEach((key) => {
      if (dbPayload[key] === undefined) delete dbPayload[key];
    });

    const { clause, values } = buildUpdateClause(dbPayload, allowed);
    if (!clause) {
      return res.status(400).json({ message: "No valid fields to update." });
    }

    let conn: any = null;
    try {
      const db = getPool();
      conn = await db.getConnection();
      await conn.beginTransaction();

      const [currentRows] = await conn.query(
        `SELECT worker_id AS workerId, status, event_id AS eventId, event_title AS eventTitle, started_at AS startedAt, ended_at AS endedAt
           FROM shifts
           WHERE id = ?
           LIMIT 1
           FOR UPDATE`,
        [req.params.id]
      );
      const current = currentRows?.[0];
      if (!current) {
        await conn.rollback();
        return res.status(404).json({ message: "Shift not found." });
      }

      const targetWorkerId = hasSanitizedField('workerId') ? sanitized.workerId : current.workerId;
      const targetStatus = hasSanitizedField('status') ? sanitized.status : current.status;
      const targetEventId = hasSanitizedField('eventId') ? sanitized.eventId : current.eventId;
      const targetEventTitle = hasSanitizedField('eventTitle') ? sanitized.eventTitle : current.eventTitle;
      const targetStartedAt = hasSanitizedField('startedAt') ? sanitized.startedAt : current.startedAt;
      const targetEndedAt = hasSanitizedField('endedAt') ? sanitized.endedAt : current.endedAt;

      // Serialize writes for destination worker while evaluating integrity constraints.
      await conn.query(`SELECT id FROM staff WHERE id = ? LIMIT 1 FOR UPDATE`, [targetWorkerId]);

      await ensureShiftNotLinkedToFutureEvent(conn, targetStatus, targetEventId, targetEventTitle);
      await ensureWorkerShiftTimeIntegrity(
        conn,
        targetWorkerId,
        targetStatus,
        targetStartedAt,
        targetEndedAt,
        req.params.id
      );

      await conn.execute(`UPDATE shifts SET ${clause} WHERE id = ?`, [...values, req.params.id]);
      await conn.commit();
      return res.json({ success: true });
    } catch (error: any) {
      if (conn) {
        try {
          await conn.rollback();
        } catch {
          // Ignore rollback errors and keep original failure response.
        }
      }
      const message = error?.message || "Shift update failed.";
      if (message.startsWith("Cannot activate shifts for future event")) {
        return res.status(400).json({ message });
      }
      if (message.startsWith('Shift conflict:')) {
        return res.status(409).json({ message });
      }
      return res.status(500).json({ message });
    } finally {
      if (conn) {
        conn.release();
      }
    }
  });
  app.delete(`${MYSQL_PREFIX}/shifts/:id`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const db = getPool();
      await db.execute("DELETE FROM shifts WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(`${MYSQL_PREFIX}/alerts`, async (req, res) => {
    if (!requireAuthorizedRead(req, res)) return;

    try {
      const db = getPool();
      const [rows] = await db.query(`
        SELECT
          id,
          message,
          zone,
          timestamp_label AS timestamp,
          severity
        FROM alerts
      `);
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(`${MYSQL_PREFIX}/alerts`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const validation = validateAlertPayload(req.body || {});
      if (!validation.valid) {
        return res.status(400).json({
          success: false,
          message: "Input validation failed",
          errors: validation.errors,
        });
      }

      const sanitized = validation.sanitized!;
      const id = makeId("al");
      const db = getPool();
      await insertAlertRecord(db, id, sanitized);
      return res.status(201).json({ id });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(`${MYSQL_PREFIX}/alerts/:id`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    const allowed = ["message", "zone", "timestamp_label", "severity"];

    const validation = validateAlertPatchPayload(req.body || {});
    if (!validation.valid) {
      return res.status(400).json({
        success: false,
        message: "Input validation failed",
        errors: validation.errors,
      });
    }

    const sanitized = validation.sanitized || {};
    const dbPayload: Record<string, unknown> = {
      message: sanitized.message,
      zone: sanitized.zone,
      timestamp_label: sanitized.timestamp,
      severity: sanitized.severity,
    };

    Object.keys(dbPayload).forEach((key) => {
      if (dbPayload[key] === undefined) delete dbPayload[key];
    });

    const { clause, values } = buildUpdateClause(dbPayload, allowed);
    if (!clause) {
      return res.status(400).json({ message: "No valid fields to update." });
    }

    try {
      const db = getPool();
      await db.execute(`UPDATE alerts SET ${clause} WHERE id = ?`, [...values, req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete(`${MYSQL_PREFIX}/alerts/:id`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const db = getPool();
      await db.execute("DELETE FROM alerts WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
}
