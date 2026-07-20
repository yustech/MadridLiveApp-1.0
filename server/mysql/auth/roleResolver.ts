import type { UserRecord, UserRole } from "../users/usersRepository";

export interface SessionIdentity { userId: string; tokenVersion: number }

export async function resolveRole(input: {
  serviceTokenValid: boolean;
  session: SessionIdentity | null;
  findUserById: (id: string) => Promise<UserRecord | null>;
}): Promise<UserRole | null> {
  if (input.serviceTokenValid) return "admin";
  if (!input.session) return null;
  const user = await input.findUserById(input.session.userId);
  if (!user || user.status !== "active" || user.tokenVersion !== input.session.tokenVersion) return null;
  return user.role;
}
