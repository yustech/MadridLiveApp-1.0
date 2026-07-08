import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ path: '/opt/madridlive-app/.env' });
dotenv.config();

const APPLY = process.argv.includes('--apply');
const MAX_REASONABLE_HOURS = 16;

type ShiftRow = {
  id: string;
  workerId: string;
  status: string;
  timespan: string;
  durationLabel: string;
  startedAt: string | null;
  endedAt: string | null;
};

type StaffTotal = {
  workerId: string;
  totalHours: number;
};

function toHoursLabel(hours: number): string {
  return `${hours.toFixed(1)}h`;
}

function parseDurationLabel(raw: string): number | null {
  const parsed = Number.parseFloat((raw || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function parseClock(value: string): number | null {
  const match = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const mins = Number(match[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(mins) || hours < 0 || hours > 23 || mins < 0 || mins > 59) {
    return null;
  }
  return hours * 60 + mins;
}

function computeHoursFromTimespan(timespan: string): number | null {
  const [fromRaw, toRaw] = (timespan || '').split(' - ');
  if (!fromRaw || !toRaw) return null;

  const startMinutes = parseClock(fromRaw);
  const endMinutes = parseClock(toRaw);
  if (startMinutes === null || endMinutes === null) return null;

  let diff = endMinutes - startMinutes;
  if (diff < 0) diff += 24 * 60;

  const hours = Math.round((diff / 60) * 10) / 10;
  return hours <= MAX_REASONABLE_HOURS ? hours : null;
}

function computeHoursFromTimestamps(startedAt: string | null, endedAt: string | null): number | null {
  if (!startedAt || !endedAt) return null;
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;

  const rawHours = (end - start) / (1000 * 60 * 60);
  const hours = Math.round(rawHours * 10) / 10;
  return hours <= MAX_REASONABLE_HOURS ? hours : null;
}

function getCanonicalHours(row: ShiftRow): { hours: number | null; source: 'timespan' | 'timestamps' | 'label' | 'none' } {
  const timespanHours = computeHoursFromTimespan(row.timespan);
  if (timespanHours !== null) {
    return { hours: timespanHours, source: 'timespan' };
  }

  const timestampHours = computeHoursFromTimestamps(row.startedAt, row.endedAt);
  if (timestampHours !== null) {
    return { hours: timestampHours, source: 'timestamps' };
  }

  const labelHours = parseDurationLabel(row.durationLabel);
  if (labelHours !== null) {
    return { hours: labelHours, source: 'label' };
  }

  return { hours: null, source: 'none' };
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
  });

  const [rows] = await db.query(
    `SELECT
       id,
       worker_id AS workerId,
       status,
       timespan,
       duration_label AS durationLabel,
       started_at AS startedAt,
       ended_at AS endedAt
     FROM shifts
     ORDER BY id DESC`
  );

  const shifts = rows as ShiftRow[];
  const completed = shifts.filter((row) => row.status?.toLowerCase() === 'completed');

  const durationChanges = completed
    .map((row) => {
      const canonical = getCanonicalHours(row);
      if (canonical.hours === null) return null;

      const current = parseDurationLabel(row.durationLabel);
      const changed = current === null || Math.abs(current - canonical.hours) >= 0.1;
      if (!changed) return null;

      return {
        id: row.id,
        workerId: row.workerId,
        from: row.durationLabel,
        to: toHoursLabel(canonical.hours),
        source: canonical.source,
      };
    })
    .filter(Boolean) as Array<{ id: string; workerId: string; from: string; to: string; source: string }>;

  const hoursByWorker = new Map<string, number>();

  for (const row of completed) {
    const canonical = getCanonicalHours(row);
    const normalizedHours = canonical.hours ?? 0;
    hoursByWorker.set(row.workerId, (hoursByWorker.get(row.workerId) || 0) + normalizedHours);
  }

  const staffTotals: StaffTotal[] = Array.from(hoursByWorker.entries()).map(([workerId, total]) => ({
    workerId,
    totalHours: Math.round(total * 10) / 10,
  }));

  console.log(`rows_total=${shifts.length}`);
  console.log(`completed_total=${completed.length}`);
  console.log(`duration_rows_to_update=${durationChanges.length}`);
  console.log(`staff_totals_to_recompute=${staffTotals.length}`);
  console.log('sample_duration_changes=');
  console.log(JSON.stringify(durationChanges.slice(0, 20), null, 2));
  console.log('sample_staff_totals=');
  console.log(JSON.stringify(staffTotals.slice(0, 20), null, 2));

  if (!APPLY) {
    console.log('mode=dry-run');
    await db.end();
    return;
  }

  await db.beginTransaction();
  try {
    for (const change of durationChanges) {
      await db.execute('UPDATE shifts SET duration_label = ? WHERE id = ?', [change.to, change.id]);
    }

    for (const total of staffTotals) {
      await db.execute('UPDATE staff SET total_hours = ? WHERE id = ?', [total.totalHours, total.workerId]);
    }

    await db.commit();
    console.log('mode=apply');
    console.log(`duration_updated=${durationChanges.length}`);
    console.log(`staff_totals_updated=${staffTotals.length}`);
  } catch (error) {
    await db.rollback();
    throw error;
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
