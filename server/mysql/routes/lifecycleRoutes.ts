import express from "express";
import { unauthorizedResponse } from "../auth";
import { getPool } from "../pool";
import { performWorkerCheckIn, performWorkerCheckOut } from "../lifecycle/workerLifecycle";

interface LifecycleRoutesOptions {
  prefix: string;
  isAuthorized: (req: express.Request) => boolean;
}

export function registerLifecycleRoutes(app: express.Express, options: LifecycleRoutesOptions) {
  const { prefix, isAuthorized } = options;

  app.post(`${prefix}/checkin`, async (req, res) => {
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
      return res.status(error?.statusCode || 500).json({
        success: false,
        ...(error?.code ? { code: error.code } : {}),
        message,
      });
    } finally {
      if (conn) {
        conn.release();
      }
    }
  });

  app.post(`${prefix}/checkout`, async (req, res) => {
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
}
