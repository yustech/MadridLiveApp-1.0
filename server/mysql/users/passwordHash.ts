import crypto from "crypto";

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;

export function hashPassword(plain: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(plain, salt, KEY_LENGTH, { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P });
  return `scrypt:${SCRYPT_N}:${SCRYPT_R}:${SCRYPT_P}:${salt.toString("hex")}:${hash.toString("hex")}`;
}

export function verifyPassword(plain: string, stored: string) {
  try {
    const [algorithm, nRaw, rRaw, pRaw, saltHex, hashHex, extra] = stored.split(":");
    if (algorithm !== "scrypt" || extra !== undefined || !/^[0-9a-f]+$/i.test(saltHex) || !/^[0-9a-f]+$/i.test(hashHex)) return false;
    const N = Number(nRaw);
    const r = Number(rRaw);
    const p = Number(pRaw);
    if (!Number.isInteger(N) || N < 2 || N > 1_048_576 || (N & (N - 1)) !== 0 || !Number.isInteger(r) || r < 1 || r > 32 || !Number.isInteger(p) || p < 1 || p > 16) return false;
    const salt = Buffer.from(saltHex, "hex");
    const expected = Buffer.from(hashHex, "hex");
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = crypto.scryptSync(plain, salt, expected.length, { N, r, p });
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// A precomputed, non-matching decoy hash. When no user matches an incoming
// login, callers verify against this instead of skipping the check, so the
// scrypt cost is paid either way and response latency does not reveal whether
// the account exists (defends against email enumeration via timing).
export const DECOY_PASSWORD_HASH = hashPassword(crypto.randomBytes(32).toString("hex"));

export function verifyPasswordWithFallback(plain: string, stored: string | null | undefined) {
  return verifyPassword(plain, stored ?? DECOY_PASSWORD_HASH);
}
