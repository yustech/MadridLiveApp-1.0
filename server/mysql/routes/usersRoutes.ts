import type express from "express";
import { validateUserPatchPayload, validateUserPayload, MIN_USER_PASSWORD_LENGTH } from "../../../src/validators";
import { hashPassword, verifyPassword } from "../users/passwordHash";
import {
  countActiveAdmins, createUser, findById, listUsers, setUserPassword, setUserStatus,
  updateUserRole, wouldLockOutLastAdmin, type UserRecord,
} from "../users/usersRepository";
import { getPool } from "../pool";
import type { RouteGuard } from "./routeAuth";

interface Options {
  prefix: string;
  requireAdmin: RouteGuard;
  requireAuthenticated: RouteGuard;
  resolveUser: (req: express.Request) => Promise<UserRecord | null>;
}

function validationResponse(res: express.Response, errors: unknown) {
  return res.status(400).json({ success: false, message: "Invalid user payload.", errors });
}

export function registerUsersRoutes(app: express.Express, options: Options) {
  const path = `${options.prefix}/users`;

  app.get(path, async (req, res) => {
    try {
      if (!(await options.requireAdmin(req, res))) return;
      return res.json({ success: true, users: await listUsers(getPool()) });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Internal server error." });
    }
  });

  app.post(path, async (req, res) => {
    try {
      if (!(await options.requireAdmin(req, res))) return;
      const validation = validateUserPayload(req.body);
      if (!validation.valid) return validationResponse(res, validation.errors);
      const { email, password, role } = validation.sanitized!;
      const user = await createUser(getPool(), { email, passwordHash: hashPassword(password), role });
      if (!user) throw new Error("Created user could not be loaded.");
      const { passwordHash: _passwordHash, ...publicUser } = user;
      return res.status(201).json({ success: true, user: publicUser });
    } catch (error: unknown) {
      if ((error as { code?: string }).code === "ER_DUP_ENTRY") return res.status(409).json({ success: false, message: "Email already exists." });
      return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Internal server error." });
    }
  });

  app.patch(`${path}/:id`, async (req, res) => {
    try {
      if (!(await options.requireAdmin(req, res))) return;
      const validation = validateUserPatchPayload(req.body);
      if (!validation.valid) return validationResponse(res, validation.errors);
      const db = getPool();
      const user = await findById(db, req.params.id);
      if (!user) return res.status(404).json({ success: false, message: "User not found." });
      const patch = validation.sanitized!;
      if (wouldLockOutLastAdmin(user, patch, await countActiveAdmins(db))) {
        return res.status(400).json({ success: false, message: "No se puede desactivar ni degradar al último administrador activo." });
      }
      if (patch.role) await updateUserRole(db, user.id, patch.role);
      if (patch.status && patch.status !== user.status) await setUserStatus(db, user.id, patch.status);
      if (patch.password) await setUserPassword(db, user.id, hashPassword(patch.password));
      const updated = await findById(db, user.id);
      const { passwordHash: _passwordHash, ...publicUser } = updated!;
      return res.json({ success: true, user: publicUser });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Internal server error." });
    }
  });

  app.post(`${path}/me/password`, async (req, res) => {
    try {
      if (!(await options.requireAuthenticated(req, res))) return;
      const currentPassword = typeof req.body?.currentPassword === "string" ? req.body.currentPassword : "";
      const newPassword = typeof req.body?.newPassword === "string" ? req.body.newPassword : "";
      if (newPassword.length < MIN_USER_PASSWORD_LENGTH) return validationResponse(res, [{ field: "newPassword", message: `Password must be at least ${MIN_USER_PASSWORD_LENGTH} characters` }]);
      const user = await options.resolveUser(req);
      if (!user || !verifyPassword(currentPassword, user.passwordHash)) return res.status(401).json({ success: false, message: "Current password is incorrect." });
      await setUserPassword(getPool(), user.id, hashPassword(newPassword));
      return res.json({ success: true, message: "Password updated. Please sign in again." });
    } catch (error: unknown) {
      return res.status(500).json({ success: false, message: error instanceof Error ? error.message : "Internal server error." });
    }
  });
}
