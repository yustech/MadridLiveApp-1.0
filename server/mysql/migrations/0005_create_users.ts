import crypto from "crypto";
import { hashPassword } from "../users/passwordHash";
import { computeMigrationChecksum, type MigrationDb, type VersionedMigration } from "./runner";

export const USERS_TABLE_DDL = `CREATE TABLE IF NOT EXISTS users (
  id VARCHAR(96) PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  role VARCHAR(32) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'active',
  token_version INT NOT NULL DEFAULT 0,
  reset_token_hash VARCHAR(255) NULL,
  reset_token_expires_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4`;

export const REQUIRED_USERS_COLUMNS = ["id", "email", "password_hash", "role", "status", "token_version", "reset_token_hash", "reset_token_expires_at", "created_at", "updated_at"];
const CHECKSUM_SOURCE = ["0005", "create_users", USERS_TABLE_DDL].join("\n");

export function getUsersVerificationErrors(rows: Array<{ columnName: string }>) {
  const found = new Set(rows.map((row) => row.columnName));
  return REQUIRED_USERS_COLUMNS.filter((column) => !found.has(column)).map((column) => `Missing users.${column} column`);
}

export function verifyUsersRows(rows: Array<{ columnName: string }>) {
  const errors = getUsersVerificationErrors(rows);
  if (errors.length) throw new Error(`users migration verification failed: ${errors.join("; ")}`);
}

async function getRows(db: MigrationDb) {
  const [rows] = await db.query(`SELECT column_name AS columnName FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'users'`);
  return Array.isArray(rows) ? rows as Array<{ columnName: string }> : [];
}

export const createUsersMigration: VersionedMigration = {
  version: "0005",
  name: "create_users",
  checksum: computeMigrationChecksum(CHECKSUM_SOURCE),
  up: async (db) => {
    await db.query(USERS_TABLE_DDL);
    const email = process.env.ADMIN_LOGIN_EMAIL?.trim().toLowerCase();
    const password = process.env.ADMIN_LOGIN_PASSWORD;
    if (email && password) {
      await db.query(
        "INSERT INTO users (id, email, password_hash, role, status) VALUES (?, ?, ?, 'admin', 'active') ON DUPLICATE KEY UPDATE email = VALUES(email)",
        [`user_${crypto.createHash("sha256").update(email).digest("hex")}`, email, hashPassword(password)]
      );
    }
  },
  verify: async (db) => verifyUsersRows(await getRows(db)),
};
