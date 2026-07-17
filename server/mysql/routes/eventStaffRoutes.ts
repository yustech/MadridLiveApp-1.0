import express from "express";
import { STAFF_ROLES } from "../../../src/validators";
import { unauthorizedResponse } from "../auth";
import { getPool } from "../pool";

const MAX_STAFF_IDS = 1000;

interface EventStaffRoutesOptions {
  prefix: string;
  isAuthorized: (req: express.Request) => boolean;
  requireAuthorizedRead: (req: express.Request, res: express.Response) => boolean;
}

interface StaffRoleRow {
  id: string;
  role: string;
}

interface AssignedWorkerRow {
  workerId: string;
}

interface MutationResult {
  affectedRows?: number;
}

function validateStaffIdsPayload(body: unknown) {
  if (typeof body !== "object" || body === null || !Array.isArray((body as { staffIds?: unknown }).staffIds)) {
    return { error: "staffIds must be an array." } as const;
  }

  const rawStaffIds = (body as { staffIds: unknown[] }).staffIds;
  if (rawStaffIds.length === 0) {
    return { error: "staffIds must contain at least one id." } as const;
  }
  if (rawStaffIds.length > MAX_STAFF_IDS) {
    return { error: `staffIds cannot contain more than ${MAX_STAFF_IDS} ids.` } as const;
  }

  const staffIds: string[] = [];
  for (const rawStaffId of rawStaffIds) {
    if (typeof rawStaffId !== "string") {
      return { error: "Every staffId must be a string." } as const;
    }
    const staffId = rawStaffId.trim();
    if (!staffId || staffId.length > 96) {
      return { error: "Every staffId must contain between 1 and 96 characters." } as const;
    }
    staffIds.push(staffId);
  }

  return { staffIds: [...new Set(staffIds)] } as const;
}

function validateAssignedRolePayload(body: unknown) {
  if (typeof body !== "object" || body === null) {
    return { error: "Expected object payload." } as const;
  }

  const rawRole = (body as { assignedRole?: unknown }).assignedRole;
  const assignedRole = typeof rawRole === "string" ? rawRole.trim() : "";
  if (!STAFF_ROLES.includes(assignedRole)) {
    return {
      error: `assignedRole must be one of: ${STAFF_ROLES.join(", ")}.`,
    } as const;
  }

  return { assignedRole } as const;
}

export function registerEventStaffRoutes(app: express.Express, options: EventStaffRoutesOptions) {
  const { prefix, isAuthorized, requireAuthorizedRead } = options;

  app.get(`${prefix}/events/:eventId/staff`, async (req, res) => {
    if (!requireAuthorizedRead(req, res)) return;

    try {
      const db = getPool();
      const [eventRows] = await db.query(
        `SELECT id FROM events WHERE id = ? LIMIT 1`,
        [req.params.eventId]
      );
      if (!Array.isArray(eventRows) || !eventRows[0]) {
        return res.status(404).json({ message: "Event not found." });
      }

      const [rows] = await db.query(
        `SELECT
           st.id,
           st.idCode AS idCode,
           st.name,
           COALESCE(st.email, '') AS email,
           COALESCE(st.phone, '') AS phone,
           es.assigned_role AS assignedRole,
           es.created_at AS createdAt
         FROM event_staff es
         INNER JOIN staff st ON st.id = es.worker_id
         WHERE es.event_id = ?
         ORDER BY st.name ASC`,
        [req.params.eventId]
      );

      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(`${prefix}/events/:eventId/staff`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    const validation = validateStaffIdsPayload(req.body);
    if ("error" in validation) {
      return res.status(400).json({ success: false, message: validation.error });
    }

    let conn: any = null;
    try {
      const db = getPool();
      conn = await db.getConnection();
      await conn.beginTransaction();

      const [eventRows] = await conn.query(
        `SELECT id FROM events WHERE id = ? LIMIT 1 FOR UPDATE`,
        [req.params.eventId]
      );
      if (!Array.isArray(eventRows) || !eventRows[0]) {
        await conn.rollback();
        return res.status(404).json({ message: "Event not found." });
      }

      const placeholders = validation.staffIds.map(() => "?").join(", ");
      const [staffRows] = await conn.query(
        `SELECT id, role FROM staff WHERE id IN (${placeholders}) FOR UPDATE`,
        validation.staffIds
      );
      const staffById = new Map(
        (Array.isArray(staffRows) ? staffRows as StaffRoleRow[] : [])
          .map((row) => [row.id, row] as const)
      );

      const [assignedRows] = await conn.query(
        `SELECT worker_id AS workerId
         FROM event_staff
         WHERE event_id = ?
           AND worker_id IN (${placeholders})`,
        [req.params.eventId, ...validation.staffIds]
      );
      const assignedIds = new Set(
        (Array.isArray(assignedRows) ? assignedRows as AssignedWorkerRow[] : [])
          .map((row) => row.workerId)
      );

      const added: string[] = [];
      const alreadyAssigned: string[] = [];
      const failed: Array<{ staffId: string; reason: string }> = [];

      for (const staffId of validation.staffIds) {
        const worker = staffById.get(staffId);
        if (!worker) {
          failed.push({ staffId, reason: "Worker not found." });
        } else if (assignedIds.has(staffId)) {
          alreadyAssigned.push(staffId);
        } else {
          added.push(staffId);
        }
      }

      if (added.length > 0) {
        const insertPlaceholders = added.map(() => "(?, ?, ?)").join(", ");
        const values = added.flatMap((staffId) => [
          req.params.eventId,
          staffId,
          staffById.get(staffId)!.role,
        ]);
        await conn.query(
          `INSERT INTO event_staff (event_id, worker_id, assigned_role)
           VALUES ${insertPlaceholders}`,
          values
        );
      }

      await conn.commit();
      return res.json({ added, alreadyAssigned, failed });
    } catch (error: any) {
      if (conn) {
        try {
          await conn.rollback();
        } catch {
          // Keep the original assignment failure.
        }
      }
      return res.status(500).json({ message: error.message });
    } finally {
      if (conn) conn.release();
    }
  });

  app.delete(`${prefix}/events/:eventId/staff/:staffId`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const db = getPool();
      const [result] = await db.execute(
        `DELETE FROM event_staff WHERE event_id = ? AND worker_id = ?`,
        [req.params.eventId, req.params.staffId]
      );
      if (Number((result as MutationResult).affectedRows || 0) === 0) {
        return res.status(404).json({ message: "Event staff assignment not found." });
      }
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.patch(`${prefix}/events/:eventId/staff/:staffId`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    const validation = validateAssignedRolePayload(req.body);
    if ("error" in validation) {
      return res.status(400).json({
        success: false,
        message: "Input validation failed",
        errors: [{ field: "assignedRole", message: validation.error }],
      });
    }

    try {
      const db = getPool();
      const [assignmentRows] = await db.query(
        `SELECT 1
         FROM event_staff
         WHERE event_id = ? AND worker_id = ?
         LIMIT 1`,
        [req.params.eventId, req.params.staffId]
      );
      if (!Array.isArray(assignmentRows) || !assignmentRows[0]) {
        return res.status(404).json({ message: "Event staff assignment not found." });
      }

      await db.execute(
        `UPDATE event_staff
         SET assigned_role = ?
         WHERE event_id = ? AND worker_id = ?`,
        [validation.assignedRole, req.params.eventId, req.params.staffId]
      );
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
}
