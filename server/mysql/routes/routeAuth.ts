import type express from "express";
import type { UserRole } from "../users/usersRepository";

export const ADMIN_ONLY: readonly UserRole[] = ["admin"];
export const CHECKIN_ROLES: readonly UserRole[] = ["admin", "operator"];
export type RouteGuard = (req: express.Request, res: express.Response) => Promise<boolean>;

export function forbiddenResponse(res: express.Response) {
  return res.status(403).json({ success: false, message: "Forbidden." });
}
