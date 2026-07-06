import express from "express";
import mysql from "mysql2/promise";

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
      location VARCHAR(255) NOT NULL,
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
      location VARCHAR(255) NOT NULL,
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
       AND column_name IN ('updated_at', 'started_at', 'ended_at')`
  );

  const found = new Set((rows as Array<{ tableName: string; columnName: string }>).map((r) => `${r.tableName}.${r.columnName}`));
  const required = ['shifts.updated_at', 'shifts.started_at', 'shifts.ended_at'];
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

  if (status.missing.includes('shifts.updated_at')) {
    await db.query(
      `ALTER TABLE shifts
       ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
    );
    migrated.push('shifts.updated_at');
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

async function ensureShiftNotLinkedToFutureEvent(db: any, status: unknown, location: unknown) {
  if (status !== 'Active') {
    return;
  }

  const locationStr = String(location || '');
  if (!locationStr.includes('(') || !locationStr.includes(')')) {
    return;
  }

  const [rows] = await db.query(
    `SELECT id, title, date_day AS dateDay, date_month AS dateMonth, doors_open AS doorsOpen
     FROM events
     WHERE ? LIKE CONCAT('%(', title, ')%')
     ORDER BY CHAR_LENGTH(title) DESC
     LIMIT 1`,
    [locationStr]
  );

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
          id,
          id_code AS idCode,
          name,
          role,
          role_label AS roleLabel,
          status,
          checked_in_time AS checkedInTime,
          last_seen AS lastSeen,
          avatar,
          CAST(total_hours AS DOUBLE) AS totalHours,
          current_shift_hours AS currentShiftHours,
          current_shift_mins AS currentShiftMins,
          location
        FROM staff
        ORDER BY name ASC
      `);
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(`${MYSQL_PREFIX}/staff`, async (req, res) => {
    try {
      const body = req.body || {};
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
          body.idCode,
          body.name,
          body.role,
          body.roleLabel,
          body.status,
          body.checkedInTime || null,
          body.lastSeen || null,
          body.avatar,
          Number(body.totalHours || 0),
          Number(body.currentShiftHours || 0),
          Number(body.currentShiftMins || 0),
          body.location,
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
      location: body.location,
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
          body.title,
          body.location,
          body.dateDay,
          body.dateMonth,
          body.doorsOpen,
          Number(body.requiredStaff || 0),
          Number(body.activeStaff || 0),
          Number(body.totalStaffNeeded || 0),
          Number(body.scanRate || 0),
          Number(body.loadInPercent || 0),
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
      location: body.location,
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
          location,
          status,
          started_at AS startedAt,
          ended_at AS endedAt,
          updated_at AS updatedAt
        FROM shifts
        ORDER BY id DESC
      `);
      return res.json(rows);
    } catch (error: any) {
      if (error?.code === "ER_BAD_FIELD_ERROR") {
        try {
          const db = getPool();
          const [rows] = await db.query(`
            SELECT
              id,
              worker_id AS workerId,
              date_string AS dateString,
              timespan,
              duration_label AS durationLabel,
              location,
              status,
              NULL AS startedAt,
              NULL AS endedAt,
              NULL AS updatedAt
            FROM shifts
            ORDER BY id DESC
          `);
          return res.json(rows);
        } catch (fallbackError: any) {
          return res.status(500).json({ message: fallbackError.message });
        }
      }

      return res.status(500).json({ message: error.message });
    }
  });

  app.post(`${MYSQL_PREFIX}/shifts`, async (req, res) => {
    try {
      const body = req.body || {};
      const id = makeId("sh");
      const db = getPool();

      await ensureShiftNotLinkedToFutureEvent(db, body.status, body.location);

      await db.execute(
        `
          INSERT INTO shifts (
            id, worker_id, date_string, timespan, duration_label, location, status, started_at, ended_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          id,
          body.workerId,
          body.dateString,
          body.timespan,
          body.durationLabel,
          body.location,
          body.status,
          toMysqlDateTimeValue(body.startedAt),
          toMysqlDateTimeValue(body.endedAt),
        ]
      );
      return res.status(201).json({ id });
    } catch (error: any) {
      const message = error?.message || "Shift creation failed.";
      if (message.startsWith("Cannot activate shifts for future event")) {
        return res.status(400).json({ message });
      }
      return res.status(500).json({ message });
    }
  });

  app.patch(`${MYSQL_PREFIX}/shifts/:id`, async (req, res) => {
    const allowed = ["worker_id", "date_string", "timespan", "duration_label", "location", "status", "started_at", "ended_at"];

    const body = req.body || {};
    const dbPayload: Record<string, unknown> = {
      worker_id: body.workerId,
      date_string: body.dateString,
      timespan: body.timespan,
      duration_label: body.durationLabel,
      location: body.location,
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

    try {
      const db = getPool();

      const [currentRows] = await db.query(
        `SELECT status, location FROM shifts WHERE id = ? LIMIT 1`,
        [req.params.id]
      );
      const current = currentRows?.[0];
      if (!current) {
        return res.status(404).json({ message: "Shift not found." });
      }

      const targetStatus = body.status ?? current.status;
      const targetLocation = body.location ?? current.location;
      await ensureShiftNotLinkedToFutureEvent(db, targetStatus, targetLocation);

      await db.execute(`UPDATE shifts SET ${clause} WHERE id = ?`, [...values, req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      const message = error?.message || "Shift update failed.";
      if (message.startsWith("Cannot activate shifts for future event")) {
        return res.status(400).json({ message });
      }
      return res.status(500).json({ message });
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
