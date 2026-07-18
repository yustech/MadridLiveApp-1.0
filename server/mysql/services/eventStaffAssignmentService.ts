import { getPool } from "../pool";

interface StaffRoleRow {
  id: string;
  role: string;
}

interface AssignedWorkerRow {
  workerId: string;
}

export interface EventStaffAssignmentCandidate {
  staffId: string;
  assignedRole?: string;
}

export interface EventStaffAssignmentResult {
  added: string[];
  alreadyAssigned: string[];
  failed: Array<{ staffId: string; reason: string }>;
}

export class EventStaffAssignmentError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "EventStaffAssignmentError";
    this.status = status;
  }
}

export async function assignStaffToEvent(
  eventId: string,
  candidates: EventStaffAssignmentCandidate[]
): Promise<EventStaffAssignmentResult> {
  const uniqueCandidates = [...new Map(candidates.map((candidate) => [candidate.staffId, candidate])).values()];
  const db = getPool();
  const conn = await db.getConnection();

  try {
    await conn.beginTransaction();
    const [eventRows] = await conn.query(
      `SELECT id FROM events WHERE id = ? LIMIT 1 FOR UPDATE`,
      [eventId]
    );
    if (!Array.isArray(eventRows) || !eventRows[0]) {
      throw new EventStaffAssignmentError("Event not found.", 404);
    }

    if (uniqueCandidates.length === 0) {
      await conn.commit();
      return { added: [], alreadyAssigned: [], failed: [] };
    }

    const staffIds = uniqueCandidates.map((candidate) => candidate.staffId);
    const placeholders = staffIds.map(() => "?").join(", ");
    const [staffRows] = await conn.query(
      `SELECT id, role FROM staff WHERE id IN (${placeholders}) FOR UPDATE`,
      staffIds
    );
    const staffById = new Map(
      (Array.isArray(staffRows) ? staffRows as StaffRoleRow[] : [])
        .map((row) => [row.id, row] as const)
    );

    const [assignedRows] = await conn.query(
      `SELECT worker_id AS workerId
       FROM event_staff
       WHERE event_id = ?
         AND worker_id IN (${placeholders})`,
      [eventId, ...staffIds]
    );
    const assignedIds = new Set(
      (Array.isArray(assignedRows) ? assignedRows as AssignedWorkerRow[] : [])
        .map((row) => row.workerId)
    );

    const addedCandidates: EventStaffAssignmentCandidate[] = [];
    const alreadyAssigned: string[] = [];
    const failed: Array<{ staffId: string; reason: string }> = [];

    for (const candidate of uniqueCandidates) {
      const worker = staffById.get(candidate.staffId);
      if (!worker) {
        failed.push({ staffId: candidate.staffId, reason: "Worker not found." });
      } else if (assignedIds.has(candidate.staffId)) {
        alreadyAssigned.push(candidate.staffId);
      } else {
        addedCandidates.push(candidate);
      }
    }

    if (addedCandidates.length > 0) {
      const insertPlaceholders = addedCandidates.map(() => "(?, ?, ?)").join(", ");
      const values = addedCandidates.flatMap((candidate) => [
        eventId,
        candidate.staffId,
        candidate.assignedRole || staffById.get(candidate.staffId)!.role,
      ]);
      await conn.query(
        `INSERT INTO event_staff (event_id, worker_id, assigned_role)
         VALUES ${insertPlaceholders}`,
        values
      );
    }

    await conn.commit();
    return {
      added: addedCandidates.map((candidate) => candidate.staffId),
      alreadyAssigned,
      failed,
    };
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // Keep the original assignment failure.
    }
    throw error;
  } finally {
    conn.release();
  }
}
