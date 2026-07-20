import { describe, expect, it, vi } from "vitest";
import { resolveRole } from "../../server/mysql/auth/roleResolver";
import type { UserRecord } from "../../server/mysql/users/usersRepository";

const user: UserRecord = { id: "u1", email: "user@example.com", passwordHash: "x", role: "operator", status: "active", tokenVersion: 2 };

describe("resolveRole", () => {
  it("maps the service token to admin without lookup", async () => {
    const lookup = vi.fn();
    expect(await resolveRole({ serviceTokenValid: true, session: null, findUserById: lookup })).toBe("admin");
    expect(lookup).not.toHaveBeenCalled();
  });
  it("resolves active sessions and rejects revoked ones", async () => {
    expect(await resolveRole({ serviceTokenValid: false, session: { userId: "u1", tokenVersion: 2 }, findUserById: async () => user })).toBe("operator");
    expect(await resolveRole({ serviceTokenValid: false, session: { userId: "u1", tokenVersion: 1 }, findUserById: async () => user })).toBeNull();
    expect(await resolveRole({ serviceTokenValid: false, session: { userId: "u1", tokenVersion: 2 }, findUserById: async () => ({ ...user, status: "inactive" }) })).toBeNull();
  });
  it("keeps anonymous requests lookup-free", async () => {
    const lookup = vi.fn();
    expect(await resolveRole({ serviceTokenValid: false, session: null, findUserById: lookup })).toBeNull();
    expect(lookup).not.toHaveBeenCalled();
  });
});
