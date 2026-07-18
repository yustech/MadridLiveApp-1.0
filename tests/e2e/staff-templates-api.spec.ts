import { expect, test, type APIRequestContext } from "@playwright/test";

const ADMIN_API_TOKEN = process.env.PLAYWRIGHT_ADMIN_API_TOKEN || process.env.ADMIN_API_TOKEN || "";
const LOCAL_MUTATION_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
const MONTH_LABELS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

interface ApiResult {
  status: number;
  json: any;
  text: string;
}

function assertLocalMutationTarget() {
  const baseUrl = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5173";
  const hostname = new URL(baseUrl).hostname;
  if (!LOCAL_MUTATION_HOSTS.has(hostname)) {
    throw new Error(`Refusing to run staff template mutations against deployed URL ${baseUrl}.`);
  }
}

async function api(
  request: APIRequestContext,
  method: "GET" | "POST" | "PATCH" | "DELETE",
  path: string,
  body?: unknown
): Promise<ApiResult> {
  const response = await request.fetch(path, {
    method,
    ...(body === undefined ? {} : { data: body }),
    headers: {
      "content-type": "application/json",
      "x-admin-token": ADMIN_API_TOKEN,
    },
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: response.status(), json, text };
}

function staffPayload(name: string, role: "Auxiliar" | "Auxiliar Plus") {
  return {
    idCode: `TPL${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 20),
    name,
    role,
    roleLabel: role,
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

function eventPayload(title: string) {
  const today = new Date();
  return {
    title,
    location: "Staff Templates E2E",
    dateDay: String(today.getDate()).padStart(2, "0"),
    dateMonth: MONTH_LABELS[today.getMonth()],
    dateYear: String(today.getFullYear()),
    doorsOpen: "00:00",
    requiredStaff: 3,
    activeStaff: 0,
    totalStaffNeeded: 3,
    scanRate: 0,
    loadInPercent: 0,
  };
}

test("staff templates preserve editable role snapshots and apply idempotently through real routes", async ({ request }) => {
  assertLocalMutationTarget();
  test.skip(!ADMIN_API_TOKEN, "An admin API token is required for staff template integration coverage.");

  expect((await request.get("/api/mysql/staff-templates")).status()).toBe(401);
  expect((await request.post("/api/mysql/staff-templates", {
    data: { name: "Unauthorized template" },
  })).status()).toBe(401);

  const stamp = Date.now();
  const staffIds: string[] = [];
  const eventIds: string[] = [];
  const templateIds: string[] = [];

  try {
    for (const [name, role] of [
      [`Template Worker A ${stamp}`, "Auxiliar"],
      [`Template Worker B ${stamp}`, "Auxiliar Plus"],
    ] as const) {
      const response = await api(request, "POST", "/api/mysql/staff", staffPayload(name, role));
      expect(response.status, response.text).toBe(201);
      staffIds.push(String(response.json.id));
    }

    for (const title of [`Template Source ${stamp}`, `Template Target ${stamp}`]) {
      const response = await api(request, "POST", "/api/mysql/events", eventPayload(title));
      expect(response.status, response.text).toBe(201);
      eventIds.push(String(response.json.id));
    }
    const [workerA, workerB] = staffIds;
    const [sourceEvent, targetEvent] = eventIds;

    expect((await api(request, "POST", `/api/mysql/events/${sourceEvent}/staff`, {
      staffIds: [workerA, workerB],
    })).status).toBe(200);
    expect((await api(request, "PATCH", `/api/mysql/events/${sourceEvent}/staff/${workerB}`, {
      assignedRole: "Coordinación",
    })).status).toBe(200);

    const createFromEvent = await api(request, "POST", "/api/mysql/staff-templates", {
      name: `Equipo principal ${stamp}`,
      eventId: sourceEvent,
    });
    expect(createFromEvent.status, createFromEvent.text).toBe(201);
    const eventTemplateId = String(createFromEvent.json.id);
    templateIds.push(eventTemplateId);
    expect(createFromEvent.json.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: workerA, assignedRole: "Auxiliar" }),
      expect.objectContaining({ id: workerB, assignedRole: "Coordinación" }),
    ]));

    expect((await api(request, "PATCH", `/api/mysql/staff/${workerB}`, {
      role: "Auxiliar",
      roleLabel: "Auxiliar",
    })).status).toBe(200);
    expect((await api(
      request,
      "PATCH",
      `/api/mysql/staff-templates/${eventTemplateId}/members/${workerA}`,
      { assignedRole: "Auxiliar Plus" }
    )).status).toBe(200);
    expect((await api(
      request,
      "PATCH",
      `/api/mysql/staff-templates/${eventTemplateId}/members/${workerA}`,
      { assignedRole: "Auxiliar Plus" }
    )).status).toBe(200);

    const listed = await api(request, "GET", "/api/mysql/staff-templates");
    expect(listed.status, listed.text).toBe(200);
    const savedTemplate = listed.json.find((template: any) => template.id === eventTemplateId);
    expect(savedTemplate.members).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: workerA, assignedRole: "Auxiliar Plus" }),
      expect.objectContaining({ id: workerB, assignedRole: "Coordinación" }),
    ]));

    expect((await api(request, "POST", `/api/mysql/events/${targetEvent}/staff`, {
      staffIds: [workerB],
    })).status).toBe(200);
    const firstApply = await api(
      request,
      "POST",
      `/api/mysql/staff-templates/${eventTemplateId}/apply`,
      { eventId: targetEvent }
    );
    expect(firstApply.status, firstApply.text).toBe(200);
    expect(firstApply.json).toEqual({ added: [workerA], alreadyAssigned: [workerB], failed: [] });

    const targetRoster = await api(request, "GET", `/api/mysql/events/${targetEvent}/staff`);
    expect(targetRoster.json).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: workerA, assignedRole: "Auxiliar Plus" }),
      expect.objectContaining({ id: workerB, assignedRole: "Auxiliar" }),
    ]));

    const secondApply = await api(
      request,
      "POST",
      `/api/mysql/staff-templates/${eventTemplateId}/apply`,
      { eventId: targetEvent }
    );
    expect(secondApply.json).toEqual({ added: [], alreadyAssigned: [workerA, workerB].sort(), failed: [] });

    const createFromScratch = await api(request, "POST", "/api/mysql/staff-templates", {
      name: `Desde cero ${stamp}`,
      members: [{ workerId: workerA, assignedRole: "Coordinación" }],
    });
    expect(createFromScratch.status, createFromScratch.text).toBe(201);
    templateIds.push(String(createFromScratch.json.id));
    expect(createFromScratch.json.members).toEqual([
      expect.objectContaining({ id: workerA, assignedRole: "Coordinación" }),
    ]);

    const deleteFromScratch = await api(
      request,
      "DELETE",
      `/api/mysql/staff-templates/${createFromScratch.json.id}`
    );
    expect(deleteFromScratch.status, deleteFromScratch.text).toBe(200);
    templateIds.splice(templateIds.indexOf(String(createFromScratch.json.id)), 1);

    const invalidRole = await api(
      request,
      "PATCH",
      `/api/mysql/staff-templates/${eventTemplateId}/members/${workerA}`,
      { assignedRole: "Supervisor" }
    );
    expect(invalidRole.status).toBe(400);
    expect(invalidRole.json.errors[0]).toMatchObject({ field: "assignedRole" });
  } finally {
    for (const templateId of templateIds) {
      await api(request, "DELETE", `/api/mysql/staff-templates/${templateId}`);
    }
    for (const eventId of eventIds) {
      await api(request, "DELETE", `/api/mysql/events/${eventId}`);
    }
    for (const staffId of staffIds) {
      await api(request, "DELETE", `/api/mysql/staff/${staffId}`);
    }
  }
});
