import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "../../server/mysql/users/passwordHash";

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
