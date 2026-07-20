import { describe, expect, it } from "vitest";
import { validateUserPatchPayload, validateUserPayload } from "../../src/validators";

describe("user validators", () => {
  it("normalizes valid creation data", () => expect(validateUserPayload({ email: " Owner@Example.com ", password: "long-password", role: "admin" })).toMatchObject({ valid: true, sanitized: { email: "owner@example.com", role: "admin" } }));
  it("rejects invalid email, role and short passwords", () => expect(validateUserPayload({ email: "bad", password: "short", role: "root" }).errors.map((e) => e.field)).toEqual(["email", "password", "role"]));
  it("allowlists patch fields", () => {
    expect(validateUserPatchPayload({ role: "viewer", status: "inactive" }).valid).toBe(true);
    expect(validateUserPatchPayload({ role: "root" }).valid).toBe(false);
  });
});
