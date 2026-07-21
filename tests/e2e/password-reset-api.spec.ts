import { expect, test, type APIRequestContext } from "@playwright/test";
import { getPool } from "../../server/mysql/pool";
import { hashResetToken } from "../../server/mail/resetToken";

const ADMIN_API_TOKEN = process.env.PLAYWRIGHT_ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN || "";
const LOCAL_MUTATION_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

function assertLocalMutationTarget() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";
  if (!LOCAL_MUTATION_HOSTS.has(new URL(baseUrl).hostname)) {
    throw new Error(`Refusing to run password reset mutation checks against deployed URL ${baseUrl}.`);
  }
}

async function post(request: APIRequestContext, path: string, data: unknown, asAdmin = false) {
  const response = await request.post(path, { data, headers: asAdmin ? { "x-admin-token": ADMIN_API_TOKEN } : undefined });
  return { status: response.status(), body: await response.json() };
}

test("password reset API is non-enumerating, expiring and single-use", async ({ request }) => {
  assertLocalMutationTarget();
  test.skip(!ADMIN_API_TOKEN, "An admin API token is required for password reset integration coverage.");
  const stamp = Date.now();
  const email = `reset.${stamp}@example.test`;
  const missingEmail = `missing.${stamp}@example.test`;
  let userId = "";

  try {
    const created = await post(request, "/api/mysql/users", { email, password: `Original-${stamp}!`, role: "viewer" }, true);
    expect(created.status).toBe(201);
    userId = String(created.body.user.id);

    const existing = await post(request, "/api/auth/forgot-password", { email });
    const missing = await post(request, "/api/auth/forgot-password", { email: missingEmail });
    expect(existing.status).toBe(200);
    expect(missing).toEqual(existing);

    const db = getPool();
    const token = `known-${stamp}`;
    const [beforeRows] = await db.query("SELECT password_hash AS passwordHash, token_version AS tokenVersion FROM users WHERE id = ?", [userId]);
    const before = (beforeRows as Array<{ passwordHash: string; tokenVersion: number }>)[0];
    await db.query("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?", [hashResetToken(token), new Date(Date.now() + 60_000), userId]);

    const reset = await post(request, "/api/auth/reset-password", { token, newPassword: `Replacement-${stamp}!` });
    expect(reset.status).toBe(200);
    const [afterRows] = await db.query("SELECT password_hash AS passwordHash, token_version AS tokenVersion, reset_token_hash AS resetTokenHash, reset_token_expires_at AS resetTokenExpiresAt FROM users WHERE id = ?", [userId]);
    const after = (afterRows as Array<{ passwordHash: string; tokenVersion: number; resetTokenHash: null; resetTokenExpiresAt: null }>)[0];
    expect(after.passwordHash).not.toBe(before.passwordHash);
    expect(after.tokenVersion).toBe(before.tokenVersion + 1);
    expect(after.resetTokenHash).toBeNull();
    expect(after.resetTokenExpiresAt).toBeNull();
    expect((await post(request, "/api/auth/reset-password", { token, newPassword: `Replacement-${stamp}!` })).status).toBe(400);

    const expiredToken = `expired-${stamp}`;
    await db.query("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?", [hashResetToken(expiredToken), new Date(Date.now() - 60_000), userId]);
    expect((await post(request, "/api/auth/reset-password", { token: expiredToken, newPassword: `Replacement-${stamp}!` })).status).toBe(400);

    const shortToken = `short-${stamp}`;
    await db.query("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?", [hashResetToken(shortToken), new Date(Date.now() + 60_000), userId]);
    expect((await post(request, "/api/auth/reset-password", { token: shortToken, newPassword: "short" })).status).toBe(400);

    await db.query("UPDATE users SET status = 'inactive', token_version = token_version + 1 WHERE id = ?", [userId]);
    const inactiveForgot = await post(request, "/api/auth/forgot-password", { email });
    expect(inactiveForgot).toEqual(existing);
    const inactiveToken = `inactive-${stamp}`;
    await db.query("UPDATE users SET reset_token_hash = ?, reset_token_expires_at = ? WHERE id = ?", [hashResetToken(inactiveToken), new Date(Date.now() + 60_000), userId]);
    expect((await post(request, "/api/auth/reset-password", { token: inactiveToken, newPassword: `Replacement-${stamp}!` })).status).toBe(400);
  } finally {
    if (userId) await getPool().query("UPDATE users SET status = 'inactive', reset_token_hash = NULL, reset_token_expires_at = NULL WHERE id = ?", [userId]);
    await getPool().end();
  }
});
