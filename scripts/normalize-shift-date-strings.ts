import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import {
  getMadridCivilDateKey,
  getMadridCivilDateParts,
  shiftMadridCivilDateKey,
} from '../src/utils/madridTime';

dotenv.config({ path: '/opt/madridlive-app/.env' });
dotenv.config();

const APPLY = process.argv.includes('--apply');

const MONTH_INDEX: Record<string, number> = {
  ene: 0,
  jan: 0,
  feb: 1,
  mar: 2,
  abr: 3,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  ago: 7,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dic: 11,
  dec: 11,
};

type ShiftRow = {
  id: string;
  dateString: string;
  updatedAt: string;
};

function formatIsoDate(date: Date): string {
  return getMadridCivilDateKey(date);
}

function normalizeDateString(value: string, updatedAtRaw: string): string | null {
  const raw = (value || '').trim();
  const normalized = raw.toLowerCase();
  const updatedAt = new Date(updatedAtRaw);
  const base = Number.isNaN(updatedAt.getTime()) ? new Date() : updatedAt;

  const isoMatch = normalized.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return null;
  }

  if (normalized.startsWith('hoy') || normalized.startsWith('today')) {
    return formatIsoDate(base);
  }

  if (normalized.startsWith('ayer') || normalized.startsWith('yesterday')) {
    return shiftMadridCivilDateKey(getMadridCivilDateKey(base), -1);
  }

  const dayMonthMatch = normalized.match(/(\d{1,2})\s+([a-záéíóúñ]{3,9})/i);
  if (dayMonthMatch) {
    const day = Number(dayMonthMatch[1]);
    const monthKey = dayMonthMatch[2].slice(0, 3).toLowerCase();
    const month = MONTH_INDEX[monthKey];
    if (Number.isFinite(day) && month !== undefined) {
      const year = getMadridCivilDateParts(base).year;
      return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  const slashMatch = normalized.match(/^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{2,4})$/);
  if (slashMatch) {
    const day = Number(slashMatch[1]);
    const month = Number(slashMatch[2]) - 1;
    const rawYear = Number(slashMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    if (Number.isFinite(day) && Number.isFinite(month) && Number.isFinite(year)) {
      return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }

  return null;
}

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
    timezone: 'Z',
  });

  let rows: unknown;
  try {
    const [rowsWithUpdatedAt] = await db.query(
      `SELECT id, date_string AS dateString, updated_at AS updatedAt FROM shifts ORDER BY id DESC`
    );
    rows = rowsWithUpdatedAt;
  } catch (error: any) {
    if (error?.code !== 'ER_BAD_FIELD_ERROR') {
      throw error;
    }

    const [rowsWithoutUpdatedAt] = await db.query(
      `SELECT id, date_string AS dateString, CURRENT_TIMESTAMP() AS updatedAt FROM shifts ORDER BY id DESC`
    );
    rows = rowsWithoutUpdatedAt;
    console.log('schema_fallback=no_updated_at');
  }

  const shifts = rows as ShiftRow[];

  const changes = shifts
    .map((row) => {
      const normalized = normalizeDateString(row.dateString, row.updatedAt);
      if (!normalized || normalized === row.dateString) return null;
      return { id: row.id, from: row.dateString, to: normalized };
    })
    .filter(Boolean) as Array<{ id: string; from: string; to: string }>;

  console.log(`rows_total=${shifts.length}`);
  console.log(`rows_to_update=${changes.length}`);
  console.log(JSON.stringify(changes.slice(0, 20), null, 2));

  if (!APPLY || changes.length === 0) {
    console.log('mode=dry-run');
    await db.end();
    return;
  }

  await db.beginTransaction();
  try {
    for (const change of changes) {
      await db.execute('UPDATE shifts SET date_string = ? WHERE id = ?', [change.to, change.id]);
    }
    await db.commit();
    console.log('mode=apply');
    console.log(`updated=${changes.length}`);
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
