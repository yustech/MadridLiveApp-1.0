import { describe, expect, it } from "vitest";
import { deleteUser, wouldDeleteLastAdmin, wouldLockOutLastAdmin } from "../../server/mysql/users/usersRepository";

describe("last active admin guard", () => {
  const admin = { role: "admin" as const, status: "active" as const };
  it("blocks deactivation and demotion of the last active admin", () => {
    expect(wouldLockOutLastAdmin(admin, { status: "inactive" }, 1)).toBe(true);
    expect(wouldLockOutLastAdmin(admin, { role: "operator" }, 1)).toBe(true);
  });
  it("allows safe changes", () => {
    expect(wouldLockOutLastAdmin(admin, { role: "operator" }, 2)).toBe(false);
    expect(wouldLockOutLastAdmin(admin, { role: "admin" }, 1)).toBe(false);
  });
});

describe("last admin delete guard", () => {
  it("blocks deleting the only admin row, active or inactive", () => {
    // Stricter than the PATCH guard on purpose: a delete cannot be undone, so the
    // sole admin account is protected even while deactivated.
    expect(wouldDeleteLastAdmin({ role: "admin" }, 1)).toBe(true);
    expect(wouldDeleteLastAdmin({ role: "admin" }, 0)).toBe(true);
  });
  it("allows deleting an admin when another admin row exists", () => {
    expect(wouldDeleteLastAdmin({ role: "admin" }, 2)).toBe(false);
  });
  it("never blocks non-admin users", () => {
    expect(wouldDeleteLastAdmin({ role: "operator" }, 1)).toBe(false);
    expect(wouldDeleteLastAdmin({ role: "viewer" }, 1)).toBe(false);
  });
});

describe("deleteUser", () => {
  function fakeDb(affectedRows: number) {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    return {
      calls,
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        return [{ affectedRows }] as [unknown, unknown?];
      },
    };
  }

  it("deletes by id and reports whether a row was removed", async () => {
    const db = fakeDb(1);
    await expect(deleteUser(db, "user_1")).resolves.toBe(true);
    expect(db.calls).toEqual([{ sql: "DELETE FROM users WHERE id = ?", values: ["user_1"] }]);
  });

  it("reports false when no row matched", async () => {
    await expect(deleteUser(fakeDb(0), "missing")).resolves.toBe(false);
  });
});
