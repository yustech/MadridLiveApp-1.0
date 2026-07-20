import express from "express";
import { validateEventPatchPayload, validateEventPayload } from "../../../src/validators";
import { unauthorizedResponse } from "../auth";
import { makeId } from "../ids";
import { getPool } from "../pool";
import { buildEventUpdatePayload, insertEventRecord } from "../repositories/eventsRepository";
import { buildUpdateClause } from "../updateClause";
import { getMadridCivilDateParts } from "../../../src/utils/madridTime";

interface EventsRoutesOptions {
  prefix: string;
  requireAdmin: (req: express.Request, res: express.Response) => Promise<boolean>;
  requireAuthorizedRead: (req: express.Request, res: express.Response) => Promise<boolean>;
}

export function registerEventsRoutes(app: express.Express, options: EventsRoutesOptions) {
  const { prefix, requireAdmin, requireAuthorizedRead } = options;

  app.get(`${prefix}/events`, async (req, res) => {
    if (!(await requireAuthorizedRead(req, res))) return;

    try {
      const db = getPool();
      const [rows] = await db.query(`
        SELECT
          id,
          title,
          location,
          dateDay AS dateDay,
          dateMonth AS dateMonth,
          COALESCE(dateYear, ?) AS dateYear,
          doorsOpen AS doorsOpen,
          required_staff AS requiredStaff,
          COALESCE(event_assignments.assignedStaffCount, 0) AS assignedStaffCount,
          active_staff AS activeStaff,
          total_staff_needed AS totalStaffNeeded,
          scan_rate AS scanRate,
          load_in_percent AS loadInPercent
        FROM events
        LEFT JOIN (
          SELECT event_id, COUNT(*) AS assignedStaffCount
          FROM event_staff
          GROUP BY event_id
        ) AS event_assignments ON event_assignments.event_id = events.id
      `, [String(getMadridCivilDateParts().year)]);
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });

  app.post(`${prefix}/events`, async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

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

  app.patch(`${prefix}/events/:id`, async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

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

  app.delete(`${prefix}/events/:id`, async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

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
      await db.execute(`DELETE FROM event_staff WHERE event_id = ?`, [req.params.id]);
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
}
