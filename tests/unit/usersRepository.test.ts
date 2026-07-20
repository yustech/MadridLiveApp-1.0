import { describe, expect, it } from "vitest";
import { wouldLockOutLastAdmin } from "../../server/mysql/users/usersRepository";

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
