import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config();

const apply = process.argv.includes('--apply');

function required(value: string | undefined, name: string) {
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

async function getMissingColumns(db: any) {
  const requiredColumns = ['updated_at', 'started_at', 'ended_at'];

  const [rows] = await db.query(
    `SELECT column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'shifts'
       AND column_name IN ('updated_at', 'started_at', 'ended_at')`
  );

  const present = new Set((rows as Array<{ columnName: string }>).map((r) => r.columnName));
  return requiredColumns.filter((column) => !present.has(column));
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
    waitForConnections: true,
    connectionLimit: 2,
    queueLimit: 0,
    charset: 'utf8mb4',
  });

  try {
    const missing = await getMissingColumns(db);

    if (missing.length === 0) {
      console.log('schema_ok=true');
      console.log('columns=shifts.updated_at,shifts.started_at,shifts.ended_at present=true');
      return;
    }

    console.log('schema_ok=false');
    console.log(`missing=${missing.map((c) => `shifts.${c}`).join(',')}`);

    if (!apply) {
      console.log('mode=dry-run');
      if (missing.includes('updated_at')) {
        console.log('action=ALTER TABLE shifts ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
      }
      if (missing.includes('started_at')) {
        console.log('action=ALTER TABLE shifts ADD COLUMN started_at DATETIME NULL');
      }
      if (missing.includes('ended_at')) {
        console.log('action=ALTER TABLE shifts ADD COLUMN ended_at DATETIME NULL');
      }
      return;
    }

    if (missing.includes('updated_at')) {
      await db.query(
        `ALTER TABLE shifts
         ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
      );
      console.log('migration_applied=shifts.updated_at');
    }

    if (missing.includes('started_at')) {
      await db.query(
        `ALTER TABLE shifts
         ADD COLUMN started_at DATETIME NULL`
      );
      console.log('migration_applied=shifts.started_at');
    }

    if (missing.includes('ended_at')) {
      await db.query(
        `ALTER TABLE shifts
         ADD COLUMN ended_at DATETIME NULL`
      );
      console.log('migration_applied=shifts.ended_at');
    }

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
