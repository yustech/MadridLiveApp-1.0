import { describe, expect, it } from "vitest";
import {
  DECOY_PASSWORD_HASH,
  hashPassword,
  verifyPassword,
  verifyPasswordWithFallback,
} from "../../server/mysql/users/passwordHash";

describe("password hashing", () => {
  it("round-trips and rejects another password", () => {
    const hash = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", hash)).toBe(true);
    expect(verifyPassword("wrong", hash)).toBe(false);
  });
  it("uses a unique random salt", () => expect(hashPassword("same")).not.toBe(hashPassword("same")));
  it.each(["", "broken", "scrypt:x:8:1:aa:bb", "scrypt:3:8:1:aa:bb", "scrypt:16384:8:1:zz:bb"])("rejects corrupt value %s", (value) => expect(verifyPassword("x", value)).toBe(false));
  it("honors serialized parameters", () => {
    const parts = hashPassword("secret").split(":");
    parts[2] = "9";
    expect(verifyPassword("secret", parts.join(":"))).toBe(false);
  });
});

describe("verifyPasswordWithFallback (timing-safe enumeration guard)", () => {
  it("matches a real password against its own hash", () => {
    const hash = hashPassword("right password");
    expect(verifyPasswordWithFallback("right password", hash)).toBe(true);
    expect(verifyPasswordWithFallback("wrong", hash)).toBe(false);
  });
  it("returns false (never throws) when no hash is provided", () => {
    expect(verifyPasswordWithFallback("anything", undefined)).toBe(false);
    expect(verifyPasswordWithFallback("anything", null)).toBe(false);
    expect(verifyPasswordWithFallback("", undefined)).toBe(false);
  });
  it("falls back to a well-formed decoy hash so scrypt still runs (no early-return)", () => {
    // A corrupt/malformed value would make verifyPassword short-circuit before
    // scrypt; the decoy must be a full, valid hash to keep timing constant.
    expect(DECOY_PASSWORD_HASH).toMatch(/^scrypt:16384:8:1:[0-9a-f]+:[0-9a-f]+$/);
    expect(verifyPassword("anything", DECOY_PASSWORD_HASH)).toBe(false);
  });
});
