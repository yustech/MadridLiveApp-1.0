import { describe, expect, it } from "vitest";
import { buildResetLink, generateResetToken, hashResetToken, isResetTokenExpired } from "../../server/mail/resetToken";

describe("password reset token helpers", () => {
  it("hashes deterministically with sha256", () => {
    expect(hashResetToken("known-token")).toBe("49e2e40e591e61357758299c8cee170fb9fa7da160ec8acf110a4a409d905aaf");
    expect(hashResetToken("known-token")).toBe(hashResetToken("known-token"));
  });

  it("detects the expiration boundary", () => {
    const expiresAt = new Date(10_000);
    expect(isResetTokenExpired(expiresAt, 9_999)).toBe(false);
    expect(isResetTokenExpired(expiresAt, 10_000)).toBe(true);
    expect(isResetTokenExpired(expiresAt, 10_001)).toBe(true);
  });

  it.each([
    "https://example.test",
    "https://example.test/",
  ])("builds an encoded reset link without duplicate slashes from %s", (baseUrl) => {
    expect(buildResetLink(baseUrl, "a/b+c")).toBe("https://example.test/reset-password?token=a%2Fb%2Bc");
  });

  it("generates distinct 256-bit base64url tokens", () => {
    const first = generateResetToken();
    const second = generateResetToken();
    expect(first).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(Buffer.from(first, "base64url")).toHaveLength(32);
    expect(second).not.toBe(first);
  });
});
