import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ensureShiftNotLinkedToFutureEvent,
  evaluateEventStaffCheckIn,
} from "../../server/mysql/lifecycle/shiftGuards";

afterEach(() => vi.useRealTimers());

describe("event_staff check-in guard", () => {
  it("allows everyone when the event has no assignments", () => {
    expect(evaluateEventStaffCheckIn({
      assignmentCount: 0,
      isAssigned: false,
      force: false,
    })).toEqual({ allowed: true });
  });

  it("allows a worker assigned to the event", () => {
    expect(evaluateEventStaffCheckIn({
      assignmentCount: 40,
      isAssigned: true,
      force: false,
    })).toEqual({ allowed: true });
  });

  it("rejects an unassigned worker without force", () => {
    expect(evaluateEventStaffCheckIn({
      assignmentCount: 40,
      isAssigned: false,
      force: false,
    })).toEqual({
      allowed: false,
      statusCode: 409,
      code: "NOT_ASSIGNED",
      message: "Worker not assigned to this event.",
    });
  });

  it("allows an unassigned worker when force is true", () => {
    expect(evaluateEventStaffCheckIn({
      assignmentCount: 40,
      isAssigned: false,
      force: true,
    })).toEqual({ allowed: true });
  });
});

describe("future event guard in Madrid", () => {
  function dbWithEvent(dateDay: string) {
    return {
      query: vi.fn().mockResolvedValue([[
        {
          id: "event-time-guard",
          title: "Evento Madrid",
          dateDay,
          dateMonth: "JUL",
          dateYear: "2026",
          doorsOpen: "23:00",
        },
      ]]),
    };
  }

  it("allows the Madrid day that has already begun while the host is still on the prior UTC day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T22:30:00Z"));
    await expect(ensureShiftNotLinkedToFutureEvent(
      dbWithEvent("19"),
      "Active",
      "event-time-guard",
      "Evento Madrid"
    )).resolves.toBeUndefined();
  });

  it("still rejects the following Madrid civil day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-18T22:30:00Z"));
    await expect(ensureShiftNotLinkedToFutureEvent(
      dbWithEvent("20"),
      "Active",
      "event-time-guard",
      "Evento Madrid"
    )).rejects.toThrow("Cannot activate shifts for future event");
  });
});
