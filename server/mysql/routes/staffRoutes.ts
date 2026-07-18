import express from "express";
import { validateStaffPatchPayload, validateStaffPayload } from "../../../src/validators";
import { unauthorizedResponse } from "../auth";
import { makeId } from "../ids";
import { getPool } from "../pool";
import { insertStaffRecord } from "../repositories/staffRepository";
import { buildUpdateClause } from "../updateClause";

interface StaffRoutesOptions {
  prefix: string;
  isAuthorized: (req: express.Request) => boolean;
  requireAuthorizedRead: (req: express.Request, res: express.Response) => boolean;
}

export function registerStaffRoutes(app: express.Express, options: StaffRoutesOptions) {
  const { prefix, isAuthorized, requireAuthorizedRead } = options;

  app.get(`${prefix}/staff`, async (req, res) => {
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

  app.post(`${prefix}/staff`, async (req, res) => {
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

  app.patch(`${prefix}/staff/:id`, async (req, res) => {
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

  app.delete(`${prefix}/staff/:id`, async (req, res) => {
    if (!isAuthorized(req)) {
      return unauthorizedResponse(res);
    }

    try {
      const db = getPool();
      await db.execute("DELETE FROM event_staff WHERE worker_id = ?", [req.params.id]);
      await db.execute("DELETE FROM staff_template_members WHERE worker_id = ?", [req.params.id]);
      await db.execute("DELETE FROM staff WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
}
