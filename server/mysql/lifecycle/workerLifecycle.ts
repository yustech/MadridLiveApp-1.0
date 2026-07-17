import { formatClockLabel, toMysqlDateTimeValue } from "../dateTime";
import { makeId } from "../ids";
import { getRequiredPayloadString, normalizeCheckInLocation } from "../payload";
import { selectPublicShiftById } from "../repositories/shiftsRepository";
import { selectPublicStaffById } from "../repositories/staffRepository";
import { makeRouteError } from "../routeErrors";
import {
  ensureShiftNotLinkedToFutureEvent,
  ensureWorkerShiftTimeIntegrity,
  getEventStaffCheckInDecision,
} from "./shiftGuards";

export async function performWorkerCheckIn(conn: any, body: Record<string, unknown>) {
  const workerId = getRequiredPayloadString(body, "workerId", 96);
  const eventId = getRequiredPayloadString(body, "eventId", 96);
  const location = normalizeCheckInLocation(body.location);
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMysql = toMysqlDateTimeValue(nowIso);
  const shiftId = makeId("sh");

  const [staffRows] = await conn.query(
    `SELECT id, COALESCE(location, '') AS location
     FROM staff
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [workerId]
  );
  const staffRow = Array.isArray(staffRows) ? staffRows[0] : null;
  if (!staffRow) {
    throw makeRouteError(404, "Worker not found.");
  }

  const [eventRows] = await conn.query(
    `SELECT id, title
     FROM events
     WHERE id = ?
     LIMIT 1`,
    [eventId]
  );
  const eventRow = Array.isArray(eventRows) ? eventRows[0] : null;
  if (!eventRow) {
    throw makeRouteError(404, "Event not found.");
  }

  const assignmentDecision = await getEventStaffCheckInDecision(
    conn,
    eventId,
    workerId,
    body.force === true
  );
  if (assignmentDecision.allowed === false) {
    throw makeRouteError(
      assignmentDecision.statusCode,
      assignmentDecision.message,
      assignmentDecision.code
    );
  }

  const [activeRows] = await conn.query(
    `SELECT id
     FROM shifts
     WHERE worker_id = ?
       AND status = 'Active'
     ORDER BY started_at DESC, updated_at DESC
     LIMIT 1
     FOR UPDATE`,
    [workerId]
  );
  if (Array.isArray(activeRows) && activeRows[0]) {
    throw makeRouteError(409, "Shift conflict: worker already has an active shift.");
  }

  await ensureShiftNotLinkedToFutureEvent(conn, "Active", eventId, eventRow.title);
  await ensureWorkerShiftTimeIntegrity(conn, workerId, "Active", nowIso, null);

  await conn.execute(
    `
      INSERT INTO shifts (
        id, worker_id, date_string, timespan, duration_label, event_id, event_title, status, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      shiftId,
      workerId,
      nowIso,
      `${formatClockLabel(now)} - Presente`,
      "Active",
      eventId,
      eventRow.title,
      "Active",
      nowMysql,
      null,
    ]
  );

  await conn.execute(
    `UPDATE staff
     SET status = 'IN',
         checkedInTime = ?,
         currentShiftHours = 0,
         currentShiftMins = 0,
         location = ?
     WHERE id = ?`,
    [nowIso, location || staffRow.location || null, workerId]
  );

  const staff = await selectPublicStaffById(conn, workerId);
  const shift = await selectPublicShiftById(conn, shiftId);

  return { action: "checkin", staff, shift };
}

export async function performWorkerCheckOut(conn: any, body: Record<string, unknown>) {
  const workerId = getRequiredPayloadString(body, "workerId", 96);
  const now = new Date();
  const nowIso = now.toISOString();
  const nowMysql = toMysqlDateTimeValue(nowIso);
  const nowLabel = formatClockLabel(now);

  const [staffRows] = await conn.query(
    `SELECT id, CAST(totalHours AS DOUBLE) AS totalHours
     FROM staff
     WHERE id = ?
     LIMIT 1
     FOR UPDATE`,
    [workerId]
  );
  const staffRow = Array.isArray(staffRows) ? staffRows[0] : null;
  if (!staffRow) {
    throw makeRouteError(404, "Worker not found.");
  }

  const [activeRows] = await conn.query(
    `SELECT id, timespan, started_at AS startedAt
     FROM shifts
     WHERE worker_id = ?
       AND status = 'Active'
     ORDER BY started_at DESC, updated_at DESC
     LIMIT 1
     FOR UPDATE`,
    [workerId]
  );
  const activeShift = Array.isArray(activeRows) ? activeRows[0] : null;
  if (!activeShift) {
    throw makeRouteError(409, "Shift conflict: worker has no active shift to close.");
  }

  const startedAtDate = activeShift.startedAt ? new Date(activeShift.startedAt) : now;
  const startTs = startedAtDate.getTime();
  const endTs = now.getTime();
  const elapsedMs = Number.isFinite(startTs) && endTs > startTs ? endTs - startTs : 0;
  const netAccruedHours = elapsedMs / (1000 * 60 * 60);
  const finalHours = Number((Number(staffRow.totalHours || 0) + netAccruedHours).toFixed(2));
  const startLabel = String(activeShift.timespan || "").split(" - ")[0] || formatClockLabel(startedAtDate);

  await conn.execute(
    `UPDATE shifts
     SET status = 'Completed',
         timespan = ?,
         duration_label = ?,
         ended_at = ?
     WHERE id = ?`,
    [
      `${startLabel} - ${nowLabel}`,
      `${netAccruedHours.toFixed(1)}h`,
      nowMysql,
      activeShift.id,
    ]
  );

  await conn.execute(
    `UPDATE staff
     SET status = 'OUT',
         checkedInTime = NULL,
         lastSeen = ?,
         currentShiftHours = 0,
         currentShiftMins = 0,
         totalHours = ?
     WHERE id = ?`,
    [nowIso, finalHours, workerId]
  );

  const staff = await selectPublicStaffById(conn, workerId);
  const shift = await selectPublicShiftById(conn, activeShift.id);

  return { action: "checkout", staff, shift };
}
