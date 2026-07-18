import { STAFF_ROLES } from "../../src/validators";

const MAX_STAFF_IDS = 1000;

export function validateStaffIdsPayload(body: unknown) {
  if (typeof body !== "object" || body === null || !Array.isArray((body as { staffIds?: unknown }).staffIds)) {
    return { error: "staffIds must be an array." } as const;
  }

  const rawStaffIds = (body as { staffIds: unknown[] }).staffIds;
  if (rawStaffIds.length === 0) {
    return { error: "staffIds must contain at least one id." } as const;
  }
  if (rawStaffIds.length > MAX_STAFF_IDS) {
    return { error: `staffIds cannot contain more than ${MAX_STAFF_IDS} ids.` } as const;
  }

  const staffIds: string[] = [];
  for (const rawStaffId of rawStaffIds) {
    if (typeof rawStaffId !== "string") {
      return { error: "Every staffId must be a string." } as const;
    }
    const staffId = rawStaffId.trim();
    if (!staffId || staffId.length > 96) {
      return { error: "Every staffId must contain between 1 and 96 characters." } as const;
    }
    staffIds.push(staffId);
  }

  return { staffIds: [...new Set(staffIds)] } as const;
}

export function validateAssignedRolePayload(body: unknown) {
  if (typeof body !== "object" || body === null) {
    return { error: "Expected object payload." } as const;
  }

  const rawRole = (body as { assignedRole?: unknown }).assignedRole;
  const assignedRole = typeof rawRole === "string" ? rawRole.trim() : "";
  if (!STAFF_ROLES.includes(assignedRole)) {
    return {
      error: `assignedRole must be one of: ${STAFF_ROLES.join(", ")}.`,
    } as const;
  }

  return { assignedRole } as const;
}
