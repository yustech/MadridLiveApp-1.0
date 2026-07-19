import express from "express";
import { validateShiftPatchPayload, validateShiftPayload } from "../../../src/validators";
import { unauthorizedResponse } from "../auth";
import { toMysqlDateTimeValue } from "../dateTime";
import { makeId } from "../ids";
import { getPool } from "../pool";
import { buildUpdateClause } from "../updateClause";

interface ShiftsRoutesOptions {
  prefix: string;
  isAuthorized: (req: express.Request) => boolean;
  requireAuthorizedRead: (req: express.Request, res: express.Response) => boolean;
  ensureShiftNotLinkedToFutureEvent: (
    db: any,
    status: unknown,
    eventId: unknown,
    eventTitle: unknown
  ) => Promise<void>;
  ensureWorkerShiftTimeIntegrity: (
    db: any,
    workerId: unknown,
    status: unknown,
    startedAt: unknown,
    endedAt: unknown,
    excludeShiftId?: string
  ) => Promise<void>;
}

export function registerShiftsRoutes(app: express.Express, options: ShiftsRoutesOptions) {
  const {
    prefix,
    isAuthorized,
    requireAuthorizedRead,
    ensureShiftNotLinkedToFutureEvent,
    ensureWorkerShiftTimeIntegrity,
  } = options;

  app.get(`${prefix}/shifts`, async (req, res) => {
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

  app.post(`${prefix}/shifts`, async (req, res) => {
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
        sanitized.startedAt,
        sanitized.endedAt
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

  app.patch(`${prefix}/shifts/:id`, async (req, res) => {
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

  app.delete(`${prefix}/shifts/:id`, async (req, res) => {
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
}
