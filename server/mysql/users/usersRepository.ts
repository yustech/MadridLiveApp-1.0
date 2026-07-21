import crypto from "crypto";

export type UserRole = "admin" | "operator" | "viewer";
export type UserStatus = "active" | "inactive";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  tokenVersion: number;
  resetTokenExpiresAt?: Date | string | null;
  createdAt?: Date | string;
  updatedAt?: Date | string;
}

export type PublicUser = Omit<UserRecord, "passwordHash" | "resetTokenExpiresAt">;

export interface UsersDb {
  query: (sql: string, values?: unknown[]) => Promise<[unknown, unknown?]>;
}

const SELECT_COLUMNS = `id, email, password_hash AS passwordHash, role, status,
  token_version AS tokenVersion, created_at AS createdAt, updated_at AS updatedAt`;

function first(rows: unknown): UserRecord | null {
  return Array.isArray(rows) && rows.length ? rows[0] as UserRecord : null;
}

export async function findByEmail(db: UsersDb, email: string) {
  const [rows] = await db.query(`SELECT ${SELECT_COLUMNS} FROM users WHERE email = ? LIMIT 1`, [email.trim().toLowerCase()]);
  return first(rows);
}

export async function findById(db: UsersDb, id: string) {
  const [rows] = await db.query(`SELECT ${SELECT_COLUMNS} FROM users WHERE id = ? LIMIT 1`, [id]);
  return first(rows);
}

export async function listUsers(db: UsersDb): Promise<PublicUser[]> {
  const [rows] = await db.query(`SELECT id, email, role, status, token_version AS tokenVersion,
    created_at AS createdAt, updated_at AS updatedAt FROM users ORDER BY email`);
  return Array.isArray(rows) ? rows as PublicUser[] : [];
}

export async function createUser(db: UsersDb, input: { email: string; passwordHash: string; role: UserRole }) {
  const id = `user_${crypto.randomUUID()}`;
  await db.query("INSERT INTO users (id, email, password_hash, role) VALUES (?, ?, ?, ?)", [id, input.email.trim().toLowerCase(), input.passwordHash, input.role]);
  return findById(db, id);
}

export async function updateUserRole(db: UsersDb, id: string, role: UserRole) {
  await db.query("UPDATE users SET role = ? WHERE id = ?", [role, id]);
}

export async function setUserStatus(db: UsersDb, id: string, status: UserStatus) {
  await db.query("UPDATE users SET status = ?, token_version = token_version + 1 WHERE id = ?", [status, id]);
}

export async function setUserPassword(db: UsersDb, id: string, passwordHash: string) {
  await db.query("UPDATE users SET password_hash = ?, token_version = token_version + 1 WHERE id = ?", [passwordHash, id]);
}

export async function setResetToken(db: UsersDb, id: string, tokenHash: string, expiresAt: Date) {
  await db.query("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?", [tokenHash, expiresAt, id]);
}

export async function findByResetTokenHash(db: UsersDb, tokenHash: string) {
  const [rows] = await db.query(`SELECT ${SELECT_COLUMNS}, reset_token_expires_at AS resetTokenExpiresAt
    FROM users WHERE reset_token_hash = ? LIMIT 1`, [tokenHash]);
  return first(rows);
}

export async function applyPasswordReset(db: UsersDb, id: string, passwordHash: string) {
  await db.query(`UPDATE users SET password_hash = ?, token_version = token_version + 1,
    reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = ?`, [passwordHash, id]);
}

export async function countActiveAdmins(db: UsersDb) {
  const [rows] = await db.query("SELECT COUNT(*) AS count FROM users WHERE role = 'admin' AND status = 'active'");
  const row = Array.isArray(rows) ? rows[0] as { count?: number | string } : undefined;
  return Number(row?.count || 0);
}

export function wouldLockOutLastAdmin(user: Pick<UserRecord, "role" | "status">, patch: { role?: UserRole; status?: UserStatus }, activeAdminCount: number) {
  if (user.role !== "admin" || user.status !== "active" || activeAdminCount > 1) return false;
  return patch.role !== undefined && patch.role !== "admin" || patch.status !== undefined && patch.status !== "active";
}
