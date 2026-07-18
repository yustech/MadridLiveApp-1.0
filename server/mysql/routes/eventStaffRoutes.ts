import express from "express";
import { unauthorizedResponse } from "../auth";
import { getPool } from "../pool";
import {
  validateAssignedRolePayload,
  validateStaffIdsPayload,
} from "../staffAssignmentValidation";
import {
  assignStaffToEvent,
  EventStaffAssignmentError,
} from "../services/eventStaffAssignmentService";

interface EventStaffRoutesOptions {
  prefix: string;
  isAuthorized: (req: express.Request) => boolean;
  requireAuthorizedRead: (req: express.Request, res: express.Response) => boolean;
}

interface MutationResult {
  affectedRows?: number;
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

    try {
      const result = await assignStaffToEvent(
        req.params.eventId,
        validation.staffIds.map((staffId) => ({ staffId }))
      );
      return res.json(result);
    } catch (error: any) {
      if (error instanceof EventStaffAssignmentError) {
        return res.status(error.status).json({ message: error.message });
      }
      return res.status(500).json({ message: error.message });
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
