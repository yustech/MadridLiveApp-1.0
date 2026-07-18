import express from "express";
import { INITIAL_ALERTS, INITIAL_EVENTS, INITIAL_SHIFTS, INITIAL_STAFF } from "./src/data";
import {
  validateAlertPayload,
  validateEventPayload,
  validateShiftPayload,
  validateStaffPayload,
} from "./src/validators";
import { isAdminAuthorized, unauthorizedResponse } from "./server/mysql/auth";
import { getPool, isMysqlConfigured } from "./server/mysql/pool";
import {
  ensureShiftNotLinkedToFutureEvent,
  ensureWorkerShiftTimeIntegrity,
} from "./server/mysql/lifecycle/shiftGuards";
import { insertAlertRecord } from "./server/mysql/repositories/alertsRepository";
import { insertEventRecord } from "./server/mysql/repositories/eventsRepository";
import { insertShiftRecord } from "./server/mysql/repositories/shiftsRepository";
import { insertStaffRecord } from "./server/mysql/repositories/staffRepository";
import { registerAlertsRoutes } from "./server/mysql/routes/alertsRoutes";
import { registerEventsRoutes } from "./server/mysql/routes/eventsRoutes";
import { registerEventStaffRoutes } from "./server/mysql/routes/eventStaffRoutes";
import { registerLifecycleRoutes } from "./server/mysql/routes/lifecycleRoutes";
import { registerShiftsRoutes } from "./server/mysql/routes/shiftsRoutes";
import { registerStaffRoutes } from "./server/mysql/routes/staffRoutes";
import { registerStaffTemplatesRoutes } from "./server/mysql/routes/staffTemplatesRoutes";
import { MIGRATIONS } from "./server/mysql/migrations";
import { runVersionedMigrations } from "./server/mysql/migrations/runner";
import { initSchema } from "./server/mysql/schema/initSchema";
import { getSchemaStatus } from "./server/mysql/schema/schemaStatus";

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
  await runVersionedMigrations(db, MIGRATIONS);
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    await conn.query('DELETE FROM shifts');
    await conn.query('DELETE FROM alerts');
    await conn.query('DELETE FROM event_staff');
    await conn.query('DELETE FROM staff_template_members');
    await conn.query('DELETE FROM staff_templates');
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
      const result = await runVersionedMigrations(db, MIGRATIONS);
      const status = result.schemaStatus;
      return res.json({
        success: status.ok,
        migrated: result.applied.map((migration) => migration.version),
        required: status.required,
        missing: status.missing,
        pending: result.pending,
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
      await runVersionedMigrations(db, MIGRATIONS);
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

  registerLifecycleRoutes(app, { prefix: MYSQL_PREFIX, isAuthorized });
  registerStaffRoutes(app, { prefix: MYSQL_PREFIX, isAuthorized, requireAuthorizedRead });
  registerEventsRoutes(app, { prefix: MYSQL_PREFIX, isAuthorized, requireAuthorizedRead });
  registerEventStaffRoutes(app, { prefix: MYSQL_PREFIX, isAuthorized, requireAuthorizedRead });
  registerStaffTemplatesRoutes(app, { prefix: MYSQL_PREFIX, isAuthorized, requireAuthorizedRead });
  registerShiftsRoutes(app, {
    prefix: MYSQL_PREFIX,
    isAuthorized,
    requireAuthorizedRead,
    ensureShiftNotLinkedToFutureEvent,
    ensureWorkerShiftTimeIntegrity,
  });
  registerAlertsRoutes(app, { prefix: MYSQL_PREFIX, isAuthorized, requireAuthorizedRead });
}
