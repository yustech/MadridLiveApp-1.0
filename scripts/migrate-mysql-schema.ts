import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { getMadridCivilDateParts } from '../src/utils/madridTime';

dotenv.config();

const apply = process.argv.includes('--apply');

const REQUIRED_COLUMNS = [
  { key: 'shifts.updated_at', tableName: 'shifts', columnName: 'updated_at' },
  { key: 'shifts.started_at', tableName: 'shifts', columnName: 'started_at' },
  { key: 'shifts.ended_at', tableName: 'shifts', columnName: 'ended_at' },
  { key: 'shifts.event_id', tableName: 'shifts', columnName: 'event_id' },
  { key: 'shifts.event_title', tableName: 'shifts', columnName: 'event_title' },
  { key: 'events.dateYear', tableName: 'events', columnName: 'dateYear' },
];

function required(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function getMissingColumns(db: any) {
  const tableNames = [...new Set(REQUIRED_COLUMNS.map((column) => column.tableName))];
  const columnNames = [...new Set(REQUIRED_COLUMNS.map((column) => column.columnName))];

  const [rows] = await db.query(
    `SELECT table_name AS tableName, column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name IN (${tableNames.map(() => '?').join(', ')})
       AND column_name IN (${columnNames.map(() => '?').join(', ')})`,
    [...tableNames, ...columnNames]
  );

  const present = new Set((rows as Array<{ tableName: string; columnName: string }>).map((row) => `${row.tableName}.${row.columnName}`));
  return REQUIRED_COLUMNS.filter((column) => !present.has(column.key));
}

async function hasColumn(db: any, tableName: string, columnName: string) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS total
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = ?
       AND column_name = ?`,
    [tableName, columnName]
  );
  return Array.isArray(rows) && Number((rows[0] as any)?.total || 0) > 0;
}

async function applyColumnMigration(db: any, key: string) {
  if (key === 'shifts.started_at') {
    await db.query(`ALTER TABLE shifts ADD COLUMN started_at DATETIME NULL`);
    return;
  }

  if (key === 'shifts.ended_at') {
    await db.query(`ALTER TABLE shifts ADD COLUMN ended_at DATETIME NULL`);
    return;
  }

  if (key === 'shifts.event_title') {
    if (await hasColumn(db, 'shifts', 'location')) {
      await db.query(`ALTER TABLE shifts CHANGE COLUMN location event_title VARCHAR(255) NOT NULL`);
    } else {
      await db.query(`ALTER TABLE shifts ADD COLUMN event_title VARCHAR(255) NOT NULL DEFAULT ''`);
    }
    return;
  }

  if (key === 'shifts.event_id') {
    await db.query(`ALTER TABLE shifts ADD COLUMN event_id VARCHAR(96) NULL`);
    return;
  }

  if (key === 'shifts.updated_at') {
    await db.query(`ALTER TABLE shifts ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`);
    return;
  }

  if (key === 'events.dateYear') {
    await db.query(`ALTER TABLE events ADD COLUMN dateYear VARCHAR(8) NULL AFTER dateMonth`);
    return;
  }

  throw new Error(`No migration handler for ${key}`);
}

function describeDryRunAction(key: string) {
  if (key === 'shifts.event_title') {
    return 'ALTER TABLE shifts CHANGE COLUMN location event_title ... OR ADD COLUMN event_title ...';
  }

  if (key === 'events.dateYear') {
    return 'ALTER TABLE events ADD COLUMN dateYear VARCHAR(8) NULL AFTER dateMonth; UPDATE events backfill current year';
  }

  return `ALTER TABLE ${key.split('.')[0]} ADD COLUMN ${key.split('.')[1]}`;
}

async function backfillEventYears(db: any) {
  if (!(await hasColumn(db, 'events', 'dateYear'))) return 0;

  const [result] = await db.query(
    `UPDATE events
     SET dateYear = ?
     WHERE dateYear IS NULL OR TRIM(dateYear) = ''`,
    [String(getMadridCivilDateParts().year)]
  );
  return Number((result as { affectedRows?: number })?.affectedRows || 0);
}

async function main() {
  const host = required(process.env.MYSQL_HOST, 'MYSQL_HOST');
  const user = required(process.env.MYSQL_USER, 'MYSQL_USER');
  const database = required(process.env.MYSQL_DATABASE, 'MYSQL_DATABASE');

  const db = mysql.createPool({
    host,
    port: Number(process.env.MYSQL_PORT || 3306),
    user,
    password: process.env.MYSQL_PASSWORD || '',
    database,
    timezone: 'Z',
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0,
    charset: 'utf8mb4',
  });

  try {
    const missing = await getMissingColumns(db);

    if (missing.length === 0) {
      console.log('schema_ok=true');
      console.log(`columns=${REQUIRED_COLUMNS.map((column) => column.key).join(',')} present=true`);
      if (apply) {
        const backfilled = await backfillEventYears(db);
        console.log(`events_dateYear_backfilled=${backfilled}`);
      }
      return;
    }

    console.log('schema_ok=false');
    console.log(`missing=${missing.map((column) => column.key).join(',')}`);

    if (!apply) {
      console.log('mode=dry-run');
      for (const column of missing) {
        console.log(`action=${describeDryRunAction(column.key)}`);
      }
      return;
    }

    for (const column of missing) {
      await applyColumnMigration(db, column.key);
      console.log(`migration_applied=${column.key}`);
    }

    const backfilled = await backfillEventYears(db);
    console.log(`events_dateYear_backfilled=${backfilled}`);
    console.log('mode=apply');
    console.log('migration_applied=true');
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
