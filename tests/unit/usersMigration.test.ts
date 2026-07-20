import { describe, expect, it, vi } from "vitest";
import { createUsersMigration, REQUIRED_USERS_COLUMNS, USERS_TABLE_DDL, verifyUsersRows } from "../../server/mysql/migrations/0005_create_users";

describe("0005 users migration", () => {
  it("defines the complete table and stable metadata", () => {
    expect(USERS_TABLE_DDL).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(USERS_TABLE_DDL).toContain("UNIQUE KEY idx_users_email");
    expect(createUsersMigration).toMatchObject({ version: "0005", name: "create_users", checksum: "bd42e800ee83013fc0a6bd1f4c16a268d72498a14d4103393f51743091664281" });
  });
  it("verifies every required column", () => {
    expect(() => verifyUsersRows(REQUIRED_USERS_COLUMNS.map((columnName) => ({ columnName })))).not.toThrow();
    expect(() => verifyUsersRows([])).toThrow("Missing users.id");
  });
  it("is idempotent and omits seed without env credentials", async () => {
    const previousEmail = process.env.ADMIN_LOGIN_EMAIL; const previousPassword = process.env.ADMIN_LOGIN_PASSWORD;
    delete process.env.ADMIN_LOGIN_EMAIL; delete process.env.ADMIN_LOGIN_PASSWORD;
    const query = vi.fn().mockResolvedValue([[], []]);
    await createUsersMigration.up({ query }); await createUsersMigration.up({ query });
    expect(query).toHaveBeenCalledTimes(2); expect(query).toHaveBeenCalledWith(USERS_TABLE_DDL);
    process.env.ADMIN_LOGIN_EMAIL = previousEmail; process.env.ADMIN_LOGIN_PASSWORD = previousPassword;
  });
});
