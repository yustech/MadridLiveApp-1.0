import { expect, test, type APIRequestContext } from "@playwright/test";

const ADMIN_API_TOKEN = process.env.PLAYWRIGHT_ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN || "";
const LOCAL_MUTATION_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

interface ApiResult { status: number; json: any; text: string }

function assertLocalMutationTarget() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";
  const hostname = new URL(baseUrl).hostname;
  if (!LOCAL_MUTATION_HOSTS.has(hostname)) {
    throw new Error(`Refusing to run users mutation checks against deployed URL ${baseUrl}.`);
  }
}

async function api(
  request: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
  asAdmin = false,
): Promise<ApiResult> {
  const response = await request.fetch(path, {
    method,
    ...(body === undefined ? {} : { data: body }),
    headers: {
      "content-type": "application/json",
      ...(asAdmin ? { "x-admin-token": ADMIN_API_TOKEN } : {}),
    },
  });
  const text = await response.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = null; }
  return { status: response.status(), json, text };
}

function staffPayload(stamp: number) {
  return {
    idCode: `USR${stamp}`.slice(0, 20),
    name: `Users API E2E ${stamp}`,
    role: "Auxiliar",
    roleLabel: "Auxiliar",
    status: "OUT",
    checkedInTime: "",
    lastSeen: "",
    avatar: "",
    email: "",
    phone: "",
    totalHours: 0,
    currentShiftHours: 0,
    currentShiftMins: 0,
    location: "",
  };
}

function eventPayload(stamp: number) {
  const today = new Date();
  return {
    title: `Users API E2E ${stamp}`,
    location: "Users role gate",
    dateDay: String(today.getDate()).padStart(2, "0"),
    dateMonth: MONTH_LABELS[today.getMonth()],
    dateYear: String(today.getFullYear()),
    doorsOpen: "00:00",
    requiredStaff: 1,
    activeStaff: 0,
    totalStaffNeeded: 1,
    scanRate: 0,
    loadInPercent: 0,
  };
}

test("real users enforce role permissions, password changes and session revocation", async ({ request }) => {
  assertLocalMutationTarget();
  test.skip(!ADMIN_API_TOKEN, "An admin API token is required for users integration coverage.");

  const stamp = Date.now();
  const operatorEmail = `operator.${stamp}@example.test`;
  const viewerEmail = `viewer.${stamp}@example.test`;
  const operatorPassword = `Operator-${stamp}!`;
  const changedOperatorPassword = `Changed-${stamp}!`;
  const viewerPassword = `Viewer-${stamp}!`;
  let operatorId = "";
  let viewerId = "";
  let workerId = "";
  let eventId = "";

  try {
    const schema = await api(request, "GET", "/api/mysql/schema-check", undefined, true);
    expect(schema.status, schema.text).toBe(200);
    expect(schema.json?.missing || []).not.toEqual(expect.arrayContaining([
      "users.id", "users.email", "users.password_hash", "users.role", "users.status", "users.token_version",
    ]));

    // /api/test-mariadb rejects an anonymous caller with 401 (no session yet).
    expect((await api(request, "POST", "/api/test-mariadb", {})).status).toBe(401);

    const worker = await api(request, "POST", "/api/mysql/staff", staffPayload(stamp), true);
    expect(worker.status, worker.text).toBe(201);
    workerId = String(worker.json?.id || "");

    const event = await api(request, "POST", "/api/mysql/events", eventPayload(stamp), true);
    expect(event.status, event.text).toBe(201);
    eventId = String(event.json?.id || "");

    const operator = await api(request, "POST", "/api/mysql/users", {
      email: operatorEmail, password: operatorPassword, role: "operator",
    }, true);
    expect(operator.status, operator.text).toBe(201);
    operatorId = String(operator.json?.user?.id || "");

    const viewer = await api(request, "POST", "/api/mysql/users", {
      email: viewerEmail, password: viewerPassword, role: "viewer",
    }, true);
    expect(viewer.status, viewer.text).toBe(201);
    viewerId = String(viewer.json?.user?.id || "");

    const operatorLogin = await api(request, "POST", "/api/auth/login", { email: operatorEmail, password: operatorPassword });
    expect(operatorLogin.status, operatorLogin.text).toBe(200);
    expect((await api(request, "GET", "/api/mysql/staff")).status).toBe(200);
    expect((await api(request, "POST", "/api/mysql/staff", staffPayload(stamp + 1))).status).toBe(403);
    expect((await api(request, "GET", "/api/mysql/users")).status).toBe(403);
    // Authenticated but non-admin: 403 (not 401) for the admin-only DB test.
    expect((await api(request, "POST", "/api/test-mariadb", {})).status).toBe(403);

    const checkin = await api(request, "POST", "/api/mysql/checkin", {
      workerId, eventId, location: "Users role gate",
    });
    expect(checkin.status, checkin.text).toBe(201);
    expect((await api(request, "POST", "/api/mysql/checkout", { workerId })).status).toBe(200);

    const passwordChange = await api(request, "POST", "/api/mysql/users/me/password", {
      currentPassword: operatorPassword,
      newPassword: changedOperatorPassword,
    });
    expect(passwordChange.status, passwordChange.text).toBe(200);
    expect((await api(request, "GET", "/api/mysql/staff")).status).toBe(401);
    expect((await api(request, "POST", "/api/auth/login", {
      email: operatorEmail, password: changedOperatorPassword,
    })).status).toBe(200);

    const viewerLogin = await api(request, "POST", "/api/auth/login", { email: viewerEmail, password: viewerPassword });
    expect(viewerLogin.status, viewerLogin.text).toBe(200);
    expect((await api(request, "GET", "/api/mysql/staff")).status).toBe(200);
    expect((await api(request, "POST", "/api/mysql/checkin", { workerId, eventId, location: "Blocked" })).status).toBe(403);
    expect((await api(request, "GET", "/api/mysql/users")).status).toBe(403);

    const deactivate = await api(request, "PATCH", `/api/mysql/users/${viewerId}`, { status: "inactive" }, true);
    expect(deactivate.status, deactivate.text).toBe(200);
    expect((await api(request, "GET", "/api/mysql/staff")).status).toBe(401);
  } finally {
    if (operatorId) await api(request, "PATCH", `/api/mysql/users/${operatorId}`, { status: "inactive" }, true);
    if (viewerId) await api(request, "PATCH", `/api/mysql/users/${viewerId}`, { status: "inactive" }, true);
    if (workerId) {
      const shifts = await api(request, "GET", "/api/mysql/shifts", undefined, true);
      if (shifts.status === 200 && Array.isArray(shifts.json)) {
        for (const shift of shifts.json.filter((item: { workerId?: string }) => item.workerId === workerId)) {
          await api(request, "DELETE", `/api/mysql/shifts/${shift.id}`, undefined, true);
        }
      }
    }
    if (eventId) await api(request, "DELETE", `/api/mysql/events/${eventId}`, undefined, true);
    if (workerId) await api(request, "DELETE", `/api/mysql/staff/${workerId}`, undefined, true);
  }
});
