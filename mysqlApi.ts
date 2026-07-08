import express from "express";
import mysql from "mysql2/promise";
import { validateStaffPayload, validateShiftPayload, validateEventPayload } from "./src/validators";

const MYSQL_PREFIX = "/api/mysql";

function isLocalRequest(req: express.Request) {
  const remoteAddress = req.socket.remoteAddress || '';
  return remoteAddress === '127.0.0.1' || remoteAddress === '::1' || remoteAddress === '::ffff:127.0.0.1';
}

function isAdminAuthorized(req: express.Request) {
  if (isLocalRequest(req)) return true;

  const expectedToken = process.env.ADMIN_API_TOKEN;
  if (!expectedToken) return true;
  const providedToken = req.header("x-admin-token");
  return providedToken === expectedToken;
}

function isMysqlConfigured() {
  return Boolean(process.env.MYSQL_HOST && process.env.MYSQL_USER && process.env.MYSQL_DATABASE);
}

let pool: any = null;

function getPool() {
  if (!pool) {
    if (!isMysqlConfigured()) {
      throw new Error("MySQL is not configured. Set MYSQL_HOST, MYSQL_USER and MYSQL_DATABASE.");
    }

    pool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT || 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD || "",
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: "utf8mb4",
    });
  }
  return pool;
}

async function initSchema() {
  const db = getPool();

  await db.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id VARCHAR(96) PRIMARY KEY,
      id_code VARCHAR(96) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(64) NOT NULL,
      role_label VARCHAR(96) NOT NULL,
      status VARCHAR(16) NOT NULL,
      checked_in_time VARCHAR(32) NULL,
      last_seen VARCHAR(128) NULL,
      avatar TEXT NOT NULL,
      total_hours DECIMAL(10,2) NOT NULL DEFAULT 0,
      current_shift_hours INT NOT NULL DEFAULT 0,
      current_shift_mins INT NOT NULL DEFAULT 0,
      location VARCHAR(255) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(96) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      location VARCHAR(255) NOT NULL,
      date_day VARCHAR(8) NOT NULL,
      date_month VARCHAR(16) NOT NULL,
      doors_open VARCHAR(32) NOT NULL,
      required_staff INT NOT NULL,
      active_staff INT NOT NULL,
      total_staff_needed INT NOT NULL,
      scan_rate INT NOT NULL,
      load_in_percent INT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS shifts (
      id VARCHAR(96) PRIMARY KEY,
      worker_id VARCHAR(96) NOT NULL,
      date_string VARCHAR(64) NOT NULL,
      timespan VARCHAR(128) NOT NULL,
      duration_label VARCHAR(64) NOT NULL,
      event_id VARCHAR(96) NULL,
      event_title VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL,
      started_at DATETIME NULL,
      ended_at DATETIME NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_shifts_worker (worker_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id VARCHAR(96) PRIMARY KEY,
      message TEXT NOT NULL,
      zone VARCHAR(128) NOT NULL,
      timestamp_label VARCHAR(64) NOT NULL,
      severity VARCHAR(16) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function getSchemaStatus(db: any) {
  const [rows] = await db.query(
    `SELECT table_name AS tableName, column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name IN ('shifts')
       AND column_name IN ('updated_at', 'started_at', 'ended_at', 'event_id', 'event_title')`
  );

  const found = new Set((rows as Array<{ tableName: string; columnName: string }>).map((r) => `${r.tableName}.${r.columnName}`));
  const required = ['shifts.updated_at', 'shifts.started_at', 'shifts.ended_at', 'shifts.event_id', 'shifts.event_title'];
  const missing = required.filter((key) => !found.has(key));

  return {
    ok: missing.length === 0,
    required,
    missing,
  };
}

async function applySchemaMigrations(db: any) {
  const status = await getSchemaStatus(db);
  const migrated: string[] = [];

  if (status.missing.includes('shifts.started_at')) {
    await db.query(
      `ALTER TABLE shifts
       ADD COLUMN started_at DATETIME NULL`
    );
    migrated.push('shifts.started_at');
  }

  if (status.missing.includes('shifts.ended_at')) {
    await db.query(
      `ALTER TABLE shifts
       ADD COLUMN ended_at DATETIME NULL`
    );
    migrated.push('shifts.ended_at');
  }

  if (status.missing.includes('shifts.event_title')) {
    const [legacyRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'shifts'
         AND column_name = 'location'`
    );
    const legacyExists = Array.isArray(legacyRows) && Number((legacyRows[0] as any)?.total || 0) > 0;
    if (legacyExists) {
      await db.query(
        `ALTER TABLE shifts
         CHANGE COLUMN location event_title VARCHAR(255) NOT NULL`
      );
    } else {
      await db.query(
        `ALTER TABLE shifts
         ADD COLUMN event_title VARCHAR(255) NOT NULL DEFAULT ''`
      );
    }
    migrated.push('shifts.event_title');
  }

  if (status.missing.includes('shifts.event_id')) {
    await db.query(`ALTER TABLE shifts ADD COLUMN event_id VARCHAR(96) NULL`);
    migrated.push('shifts.event_id');
  }

  if (status.missing.includes('shifts.updated_at')) {
    await db.query(
      `ALTER TABLE shifts
       ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
    );
    migrated.push('shifts.updated_at');
  }

  const [staffLocationRows] = await db.query(
    `SELECT IS_NULLABLE AS isNullable
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'staff'
         AND column_name = 'location'
       LIMIT 1`
  );
  const staffLocation = Array.isArray(staffLocationRows) ? staffLocationRows[0] : null;
  if (staffLocation?.isNullable === 'NO') {
    await db.query(
      `ALTER TABLE staff
       MODIFY COLUMN location VARCHAR(255) NULL`
    );
    migrated.push('staff.location_nullable');
  }

  return { migrated };
}

function makeId(prefix: string) {
  return `${prefix}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
}

function toMysqlDateTimeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return null;

  const pad = (num: number) => String(num).padStart(2, '0');
  return (
    String(date.getFullYear()) + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + ' ' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes()) + ':' +
    pad(date.getSeconds())
  );
}
function buildUpdateClause(payload: Record<string, unknown>, allowedFields: string[]) {
  const fields = Object.keys(payload).filter((key) => allowedFields.includes(key));
  if (fields.length === 0) {
    return { clause: "", values: [] as unknown[] };
  }

  const clause = fields.map((field) => `${field} = ?`).join(", ");
  const values = fields.map((field) => payload[field]);
  return { clause, values };
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

function parseEventDateTime(dateDay?: string, dateMonth?: string, doorsOpen?: string) {
  const day = Number(String(dateDay || '').trim());
  const monthToken = String(dateMonth || '').trim().toUpperCase();
  const month = MONTH_INDEX[monthToken];

  if (!Number.isInteger(day) || day < 1 || day > 31 || month === undefined) {
    return null;
  }

  const [hourRaw, minRaw] = String(doorsOpen || '00:00').split(':');
  const hour = Number(hourRaw);
  const minute = Number(minRaw);
  const now = new Date();

  const eventDate = new Date(
    now.getFullYear(),
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
      `SELECT id, title, date_day AS dateDay, date_month AS dateMonth, doors_open AS doorsOpen
       FROM events
       WHERE id = ?
       LIMIT 1`,
      [eventIdStr]
    );
  } else {
    [rows] = await db.query(
      `SELECT id, title, date_day AS dateDay, date_month AS dateMonth, doors_open AS doorsOpen
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

  const eventDate = parseEventDateTime(event.dateDay, event.dateMonth, event.doorsOpen);
  if (!eventDate) {
    return;
  }

  // Allow check-ins for events happening today, even if doors_open is later.
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const eventDayStart = new Date(
    eventDate.getFullYear(),
    eventDate.getMonth(),
    eventDate.getDate()
  ).getTime();

  if (eventDayStart > todayStart) {
    throw new Error(`Cannot activate shifts for future event: ${event.title} (${event.dateDay} ${event.dateMonth}).`);
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
export function registerMysqlApi(app: express.Express) {
  app.get(`${MYSQL_PREFIX}/status`, async (_req, res) => {
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

  app.get(`${MYSQL_PREFIX}/schema-check`, async (_req, res) => {
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
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ success: false, message: 'Unauthorized.' });
    }

    try {
      const db = getPool();
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
    if (!isAdminAuthorized(req)) {
      return res.status(401).json({ success: false, message: "Unauthorized." });
    }

    try {
      await initSchema();
      return res.json({ success: true, message: "MySQL schema initialized." });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error.message });
    }
  });

  app.get(`${MYSQL_PREFIX}/staff`, async (_req, res) => {
    try {
      const db = getPool();
      const [rows] = await db.query(`
        SELECT
          st.id,
          st.id_code AS idCode,
          st.name,
          st.role,
          st.role_label AS roleLabel,
          CASE WHEN active.worker_id IS NOT NULL THEN 'IN' ELSE 'OUT' END AS status,
          CASE WHEN active.worker_id IS NOT NULL THEN st.checked_in_time ELSE '' END AS checkedInTime,
          st.last_seen AS lastSeen,
          st.avatar,
          CAST(st.total_hours AS DOUBLE) AS totalHours,
          CASE WHEN active.worker_id IS NOT NULL THEN st.current_shift_hours ELSE 0 END AS currentShiftHours,
          CASE WHEN active.worker_id IS NOT NULL THEN st.current_shift_mins ELSE 0 END AS currentShiftMins,
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

      await db.execute(
        `
          INSERT INTO staff (
            id, id_code, name, role, role_label, status, checked_in_time, last_seen,
            avatar, total_hours, current_shift_hours, current_shift_mins, location
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          sanitized.idCode,
          sanitized.name,
          sanitized.role,
          sanitized.roleLabel,
          sanitized.status,
          sanitized.checkedInTime || null,
          sanitized.lastSeen || null,
          sanitized.avatar,
          Number(0),
          Number(0),
          Number(0),
          sanitized.location || null,
        ]
      );

      return res.status(201).json({ id });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(`${MYSQL_PREFIX}/staff/:id`, async (req, res) => {
    const allowed = [
      "id_code",
      "name",
      "role",
      "role_label",
      "status",
      "checked_in_time",
      "last_seen",
      "avatar",
      "total_hours",
      "current_shift_hours",
      "current_shift_mins",
      "location",
    ];

    const body = req.body || {};
    const dbPayload: Record<string, unknown> = {
      id_code: body.idCode,
      name: body.name,
      role: body.role,
      role_label: body.roleLabel,
      status: body.status,
      checked_in_time: body.checkedInTime,
      last_seen: body.lastSeen,
      avatar: body.avatar,
      total_hours: body.totalHours,
      current_shift_hours: body.currentShiftHours,
      current_shift_mins: body.currentShiftMins,
      event_id: body.eventId,
      event_title: body.eventTitle,
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
      await db.execute(`UPDATE staff SET ${clause} WHERE id = ?`, [...values, req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete(`${MYSQL_PREFIX}/staff/:id`, async (req, res) => {
    try {
      const db = getPool();
      await db.execute("DELETE FROM staff WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(`${MYSQL_PREFIX}/events`, async (_req, res) => {
    try {
      const db = getPool();
      const [rows] = await db.query(`
        SELECT
          id,
          title,
          location,
          date_day AS dateDay,
          date_month AS dateMonth,
          doors_open AS doorsOpen,
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
      await db.execute(
        `
          INSERT INTO events (
            id, title, location, date_day, date_month, doors_open,
            required_staff, active_staff, total_staff_needed, scan_rate, load_in_percent
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          sanitized.title,
          sanitized.eventId || null,
          sanitized.eventTitle,
          sanitized.dateDay,
          sanitized.dateMonth,
          sanitized.doorsOpen,
          Number(sanitized.requiredStaff || 0),
          Number(sanitized.activeStaff || 0),
          Number(sanitized.totalStaffNeeded || 0),
          Number(sanitized.scanRate || 0),
          Number(sanitized.loadInPercent || 0),
        ]
      );
      return res.status(201).json({ id });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(`${MYSQL_PREFIX}/events/:id`, async (req, res) => {
    const allowed = [
      "title",
      "location",
      "date_day",
      "date_month",
      "doors_open",
      "required_staff",
      "active_staff",
      "total_staff_needed",
      "scan_rate",
      "load_in_percent",
    ];

    const body = req.body || {};
    const dbPayload: Record<string, unknown> = {
      title: body.title,
      event_id: body.eventId,
      event_title: body.eventTitle,
      date_day: body.dateDay,
      date_month: body.dateMonth,
      doors_open: body.doorsOpen,
      required_staff: body.requiredStaff,
      active_staff: body.activeStaff,
      total_staff_needed: body.totalStaffNeeded,
      scan_rate: body.scanRate,
      load_in_percent: body.loadInPercent,
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
      await db.execute(`UPDATE events SET ${clause} WHERE id = ?`, [...values, req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.delete(`${MYSQL_PREFIX}/events/:id`, async (req, res) => {
    try {
      const db = getPool();
      await db.execute("DELETE FROM events WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(`${MYSQL_PREFIX}/shifts`, async (_req, res) => {
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
    const allowed = ["worker_id", "date_string", "timespan", "duration_label", "event_id", "event_title", "status", "started_at", "ended_at"];

    const body = req.body || {};
    const dbPayload: Record<string, unknown> = {
      worker_id: body.workerId,
      date_string: body.dateString,
      timespan: body.timespan,
      duration_label: body.durationLabel,
      event_id: body.eventId,
      event_title: body.eventTitle,
      status: body.status,
      started_at: body.startedAt === undefined ? undefined : toMysqlDateTimeValue(body.startedAt),
      ended_at: body.endedAt === undefined ? undefined : toMysqlDateTimeValue(body.endedAt),
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

      const targetWorkerId = body.workerId ?? current.workerId;
      const targetStatus = body.status ?? current.status;
      const targetEventId = body.eventId ?? current.eventId;
      const targetEventTitle = body.eventTitle ?? current.eventTitle;
      const targetStartedAt = body.startedAt === undefined ? current.startedAt : body.startedAt;
      const targetEndedAt = body.endedAt === undefined ? current.endedAt : body.endedAt;

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
    try {
      const db = getPool();
      await db.execute("DELETE FROM shifts WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.get(`${MYSQL_PREFIX}/alerts`, async (_req, res) => {
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
    try {
      const body = req.body || {};
      const id = makeId("al");
      const db = getPool();
      await db.execute(
        `
          INSERT INTO alerts (
            id, message, zone, timestamp_label, severity
          ) VALUES (?, ?, ?, ?, ?)
        `,
        [id, body.message, body.zone, body.timestamp, body.severity]
      );
      return res.status(201).json({ id });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(`${MYSQL_PREFIX}/alerts/:id`, async (req, res) => {
    const allowed = ["message", "zone", "timestamp_label", "severity"];

    const body = req.body || {};
    const dbPayload: Record<string, unknown> = {
      message: body.message,
      zone: body.zone,
      timestamp_label: body.timestamp,
      severity: body.severity,
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
    try {
      const db = getPool();
      await db.execute("DELETE FROM alerts WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
}
