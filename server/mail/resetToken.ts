import crypto from "crypto";

export const RESET_TOKEN_TTL_MS = 45 * 60 * 1000;

export function generateResetToken() {
  return crypto.randomBytes(32).toString("base64url");
}

export function hashResetToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

export function isResetTokenExpired(expiresAt: Date | string | null | undefined, now = Date.now()) {
  if (!expiresAt) return true;
  const expiry = expiresAt instanceof Date ? expiresAt.getTime() : new Date(expiresAt).getTime();
  return !Number.isFinite(expiry) || expiry <= now;
}

export function buildResetLink(baseUrl: string, token: string) {
  return `${baseUrl.replace(/\/+$/, "")}/reset-password?token=${encodeURIComponent(token)}`;
}
