import { toMysqlDateTimeValue } from "../dateTime";
import { getMadridCivilDateKey, getMadridCivilDateParts } from "../../../src/utils/madridTime";
import { parseEventDateTime } from "./eventDateTime";

export interface EventStaffCheckInInput {
  assignmentCount: number;
  isAssigned: boolean;
  force: boolean;
}

export type EventStaffCheckInDecision =
  | { allowed: true }
  | {
      allowed: false;
      statusCode: 409;
      code: "NOT_ASSIGNED";
      message: "Worker not assigned to this event.";
    };

export function evaluateEventStaffCheckIn({
  assignmentCount,
  isAssigned,
  force,
}: EventStaffCheckInInput): EventStaffCheckInDecision {
  if (assignmentCount === 0 || isAssigned || force) {
    return { allowed: true };
  }

  return {
    allowed: false,
    statusCode: 409,
    code: "NOT_ASSIGNED",
    message: "Worker not assigned to this event.",
  };
}

export async function getEventStaffCheckInDecision(
  db: any,
  eventId: string,
  workerId: string,
  force: boolean
) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS assignmentCount,
            COALESCE(MAX(CASE WHEN worker_id = ? THEN 1 ELSE 0 END), 0) AS isAssigned
     FROM event_staff
     WHERE event_id = ?`,
    [workerId, eventId]
  );
  const row = Array.isArray(rows) ? rows[0] : null;

  return evaluateEventStaffCheckIn({
    assignmentCount: Number(row?.assignmentCount || 0),
    isAssigned: Number(row?.isAssigned || 0) > 0,
    force,
  });
}

export async function ensureShiftNotLinkedToFutureEvent(db: any, status: unknown, eventId: unknown, eventTitle: unknown) {
  if (String(status || '').toLowerCase() !== 'active') {
    return;
  }

  const eventIdStr = String(eventId || '').trim();
  const eventTitleStr = String(eventTitle || '').trim();
  if (!eventIdStr && !eventTitleStr) {
    return;
  }

  let rows: any[] = [];
  if (eventIdStr) {
    [rows] = await db.query(
      `SELECT id, title, dateDay AS dateDay, dateMonth AS dateMonth, dateYear AS dateYear, doorsOpen AS doorsOpen
       FROM events
       WHERE id = ?
       LIMIT 1`,
      [eventIdStr]
    );
  } else {
    [rows] = await db.query(
      `SELECT id, title, dateDay AS dateDay, dateMonth AS dateMonth, dateYear AS dateYear, doorsOpen AS doorsOpen
       FROM events
       WHERE title = ?
       LIMIT 1`,
      [eventTitleStr]
    );
  }

  const event = rows?.[0];
  if (!event) {
    return;
  }

  const eventDate = parseEventDateTime(event.dateDay, event.dateMonth, event.dateYear, event.doorsOpen);
  if (!eventDate) {
    return;
  }

  // Allow check-ins for events happening today, even if doorsOpen is later.
  const todayKey = getMadridCivilDateKey();
  const eventDayKey = getMadridCivilDateKey(eventDate);

  if (eventDayKey > todayKey) {
    throw new Error(`Cannot activate shifts for future event: ${event.title} (${event.dateDay} ${event.dateMonth} ${getMadridCivilDateParts(eventDate).year}).`);
  }
}


export async function ensureWorkerShiftTimeIntegrity(
  db: any,
  workerId: unknown,
  status: unknown,
  startedAt: unknown,
  endedAt: unknown,
  excludeShiftId?: string
) {
  const workerIdStr = String(workerId || '').trim();
  if (!workerIdStr) return;

  const isActivating = String(status || '').toLowerCase() === 'active';
  const startedAtMysql = startedAt === undefined ? null : toMysqlDateTimeValue(startedAt);
  const endedAtMysql = endedAt === undefined ? null : toMysqlDateTimeValue(endedAt);
  const excludedId = excludeShiftId || '__NO_EXCLUDED_SHIFT__';

  if (isActivating) {
    const [activeRows] = await db.query(
      `SELECT id
       FROM shifts
       WHERE worker_id = ?
         AND status = 'Active'
         AND id <> ?
       LIMIT 1`,
      [workerIdStr, excludedId]
    );

    if (activeRows?.[0]) {
      throw new Error('Shift conflict: worker already has an active shift.');
    }
  }

  // Overlap checks require a normalized start timestamp.
  if (!startedAtMysql) {
    return;
  }

  const [overlapRows] = await db.query(
    `SELECT id
     FROM shifts
     WHERE worker_id = ?
       AND id <> ?
       AND started_at IS NOT NULL
       AND (? IS NULL OR started_at < ?)
       AND COALESCE(ended_at, '9999-12-31 23:59:59') > ?
     LIMIT 1`,
    [workerIdStr, excludedId, endedAtMysql, endedAtMysql, startedAtMysql]
  );

  if (overlapRows?.[0]) {
    throw new Error('Shift conflict: overlapping time range for worker.');
  }
}
