import express from "express";
import { validateAlertPatchPayload, validateAlertPayload } from "../../../src/validators";
import { unauthorizedResponse } from "../auth";
import { makeId } from "../ids";
import { getPool } from "../pool";
import { insertAlertRecord } from "../repositories/alertsRepository";
import { buildUpdateClause } from "../updateClause";

interface AlertsRoutesOptions {
  prefix: string;
  requireAdmin: (req: express.Request, res: express.Response) => Promise<boolean>;
  requireAuthorizedRead: (req: express.Request, res: express.Response) => Promise<boolean>;
}

export function registerAlertsRoutes(app: express.Express, options: AlertsRoutesOptions) {
  const { prefix, requireAdmin, requireAuthorizedRead } = options;

  app.get(`${prefix}/alerts`, async (req, res) => {
    if (!(await requireAuthorizedRead(req, res))) return;

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

  app.post(`${prefix}/alerts`, async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

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

  app.patch(`${prefix}/alerts/:id`, async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

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

  app.delete(`${prefix}/alerts/:id`, async (req, res) => {
    if (!(await requireAdmin(req, res))) return;

    try {
      const db = getPool();
      await db.execute("DELETE FROM alerts WHERE id = ?", [req.params.id]);
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ message: error.message });
    }
  });
}
