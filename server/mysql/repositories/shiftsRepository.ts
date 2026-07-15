import { toMysqlDateTimeValue } from "../dateTime";

export async function insertShiftRecord(db: any, id: string, sanitized: Record<string, any>) {
  await db.execute(
    `
      INSERT INTO shifts (
        id, worker_id, date_string, timespan, duration_label, event_id, event_title, status, started_at, ended_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      id,
      String(sanitized.workerId),
      sanitized.dateString,
      sanitized.timespan,
      sanitized.durationLabel,
      sanitized.eventId || null,
      sanitized.eventTitle,
      sanitized.status,
      toMysqlDateTimeValue(sanitized.startedAt),
      toMysqlDateTimeValue(sanitized.endedAt),
    ]
  );
}

export async function selectPublicShiftById(db: any, shiftId: string) {
  const [rows] = await db.query(
    `
      SELECT
        id,
        worker_id AS workerId,
        date_string AS dateString,
        timespan,
        duration_label AS durationLabel,
        event_id AS eventId,
        event_title AS eventTitle,
        status,
        started_at AS startedAt,
        ended_at AS endedAt,
        updated_at AS updatedAt
      FROM shifts
      WHERE id = ?
      LIMIT 1
    `,
    [shiftId]
  );

  return Array.isArray(rows) ? rows[0] || null : null;
}
