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
    throw new Error(`Refusing to run event_staff mutation checks against deployed URL ${baseUrl}.`);
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
    idCode: `EVT${Date.now()}${Math.floor(Math.random() * 1000)}`.slice(0, 20),
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
    location: "Event Staff E2E Gate",
    dateDay: String(today.getDate()).padStart(2, "0"),
    dateMonth: MONTH_LABELS[today.getMonth()],
    dateYear: String(today.getFullYear()),
    doorsOpen: "00:00",
    requiredStaff: 2,
    activeStaff: 0,
    totalStaffNeeded: 2,
    scanRate: 0,
    loadInPercent: 0,
  };
}

test("event_staff assignments gate check-in while empty rosters remain backward compatible", async ({ request }) => {
  assertLocalMutationTarget();
  test.skip(!ADMIN_API_TOKEN, "An admin API token is required for event_staff integration coverage.");

  const stamp = Date.now();
  const staffIds: string[] = [];
  const eventIds: string[] = [];

  try {
    const assignedStaffResponse = await api(
      request,
      "POST",
      "/api/mysql/staff",
      staffPayload(`Event Staff Assigned ${stamp}`, "Auxiliar Plus")
    );
    expect(assignedStaffResponse.status, assignedStaffResponse.text).toBe(201);
    const assignedWorkerId = String(assignedStaffResponse.json?.id || "");
    expect(assignedWorkerId).toBeTruthy();
    staffIds.push(assignedWorkerId);

    const exceptionalStaffResponse = await api(
      request,
      "POST",
      "/api/mysql/staff",
      staffPayload(`Event Staff Exceptional ${stamp}`, "Auxiliar")
    );
    expect(exceptionalStaffResponse.status, exceptionalStaffResponse.text).toBe(201);
    const exceptionalWorkerId = String(exceptionalStaffResponse.json?.id || "");
    expect(exceptionalWorkerId).toBeTruthy();
    staffIds.push(exceptionalWorkerId);

    const emptyEventResponse = await api(
      request,
      "POST",
      "/api/mysql/events",
      eventPayload(`Event Staff Empty ${stamp}`)
    );
    expect(emptyEventResponse.status, emptyEventResponse.text).toBe(201);
    const emptyEventId = String(emptyEventResponse.json?.id || "");
    expect(emptyEventId).toBeTruthy();
    eventIds.push(emptyEventId);

    const populatedEventResponse = await api(
      request,
      "POST",
      "/api/mysql/events",
      eventPayload(`Event Staff Populated ${stamp}`)
    );
    expect(populatedEventResponse.status, populatedEventResponse.text).toBe(201);
    const populatedEventId = String(populatedEventResponse.json?.id || "");
    expect(populatedEventId).toBeTruthy();
    eventIds.push(populatedEventId);

    const emptyRosterCheckIn = await api(request, "POST", "/api/mysql/checkin", {
      workerId: exceptionalWorkerId,
      eventId: emptyEventId,
      location: "Empty roster gate",
    });
    expect(emptyRosterCheckIn.status, emptyRosterCheckIn.text).toBe(201);
    expect((await api(request, "POST", "/api/mysql/checkout", {
      workerId: exceptionalWorkerId,
    })).status).toBe(200);

    const missingWorkerId = `usr_missing_${stamp}`;
    const assignResponse = await api(
      request,
      "POST",
      `/api/mysql/events/${populatedEventId}/staff`,
      { staffIds: [assignedWorkerId, missingWorkerId] }
    );
    expect(assignResponse.status, assignResponse.text).toBe(200);
    expect(assignResponse.json).toEqual({
      added: [assignedWorkerId],
      alreadyAssigned: [],
      failed: [{ staffId: missingWorkerId, reason: "Worker not found." }],
    });

    const idempotentResponse = await api(
      request,
      "POST",
      `/api/mysql/events/${populatedEventId}/staff`,
      { staffIds: [assignedWorkerId] }
    );
    expect(idempotentResponse.status, idempotentResponse.text).toBe(200);
    expect(idempotentResponse.json).toEqual({
      added: [],
      alreadyAssigned: [assignedWorkerId],
      failed: [],
    });

    const rosterResponse = await api(
      request,
      "GET",
      `/api/mysql/events/${populatedEventId}/staff`
    );
    expect(rosterResponse.status, rosterResponse.text).toBe(200);
    expect(rosterResponse.json).toEqual([
      expect.objectContaining({
        id: assignedWorkerId,
        name: `Event Staff Assigned ${stamp}`,
        assignedRole: "Auxiliar Plus",
        createdAt: expect.anything(),
      }),
    ]);

    const invalidRoleResponse = await api(
      request,
      "PATCH",
      `/api/mysql/events/${populatedEventId}/staff/${assignedWorkerId}`,
      { assignedRole: "Supervisor" }
    );
    expect(invalidRoleResponse.status, invalidRoleResponse.text).toBe(400);

    const patchRoleResponse = await api(
      request,
      "PATCH",
      `/api/mysql/events/${populatedEventId}/staff/${assignedWorkerId}`,
      { assignedRole: "Coordinación" }
    );
    expect(patchRoleResponse.status, patchRoleResponse.text).toBe(200);

    const updatedRosterResponse = await api(
      request,
      "GET",
      `/api/mysql/events/${populatedEventId}/staff`
    );
    expect(updatedRosterResponse.json[0].assignedRole).toBe("Coordinación");
    const globalStaffResponse = await api(request, "GET", "/api/mysql/staff");
    expect(globalStaffResponse.json.find((worker: any) => worker.id === assignedWorkerId)?.role).toBe("Auxiliar Plus");

    const blockedCheckIn = await api(request, "POST", "/api/mysql/checkin", {
      workerId: exceptionalWorkerId,
      eventId: populatedEventId,
      location: "Unassigned gate",
    });
    expect(blockedCheckIn.status, blockedCheckIn.text).toBe(409);
    expect(blockedCheckIn.json).toMatchObject({
      code: "NOT_ASSIGNED",
      message: "Worker not assigned to this event.",
    });

    const forcedCheckIn = await api(request, "POST", "/api/mysql/checkin", {
      workerId: exceptionalWorkerId,
      eventId: populatedEventId,
      location: "Exceptional gate",
      force: true,
    });
    expect(forcedCheckIn.status, forcedCheckIn.text).toBe(201);
    expect((await api(request, "POST", "/api/mysql/checkout", {
      workerId: exceptionalWorkerId,
    })).status).toBe(200);

    const assignedCheckIn = await api(request, "POST", "/api/mysql/checkin", {
      workerId: assignedWorkerId,
      eventId: populatedEventId,
      location: "Assigned gate",
    });
    expect(assignedCheckIn.status, assignedCheckIn.text).toBe(201);
    expect((await api(request, "POST", "/api/mysql/checkout", {
      workerId: assignedWorkerId,
    })).status).toBe(200);

    const deleteAssignmentResponse = await api(
      request,
      "DELETE",
      `/api/mysql/events/${populatedEventId}/staff/${assignedWorkerId}`
    );
    expect(deleteAssignmentResponse.status, deleteAssignmentResponse.text).toBe(200);
    expect((await api(
      request,
      "GET",
      `/api/mysql/events/${populatedEventId}/staff`
    )).json).toEqual([]);
  } finally {
    const shiftsResponse = await api(request, "GET", "/api/mysql/shifts");
    if (shiftsResponse.status === 200 && Array.isArray(shiftsResponse.json)) {
      for (const shift of shiftsResponse.json.filter((item: any) => staffIds.includes(item.workerId))) {
        await api(request, "DELETE", `/api/mysql/shifts/${shift.id}`);
      }
    }
    for (const eventId of eventIds) {
      await api(request, "DELETE", `/api/mysql/events/${eventId}`);
    }
    for (const staffId of staffIds) {
      await api(request, "DELETE", `/api/mysql/staff/${staffId}`);
    }
  }
});
