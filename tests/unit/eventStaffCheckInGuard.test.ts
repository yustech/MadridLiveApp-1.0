import { describe, expect, it } from "vitest";
import { evaluateEventStaffCheckIn } from "../../server/mysql/lifecycle/shiftGuards";

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
