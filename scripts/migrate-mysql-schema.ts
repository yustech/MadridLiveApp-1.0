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

async function hasUpdatedAtColumn(db: any) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'shifts'
       AND column_name = 'updated_at'`
  );

  const count = Number((rows as Array<{ cnt: number }>)[0]?.cnt || 0);
  return count > 0;
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
    const hasColumn = await hasUpdatedAtColumn(db);

    if (hasColumn) {
      console.log('schema_ok=true');
      console.log('column=shifts.updated_at present=true');
      return;
    }

    console.log('schema_ok=false');
    console.log('column=shifts.updated_at present=false');

    if (!apply) {
      console.log('mode=dry-run');
      console.log('action=ALTER TABLE shifts ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP');
      return;
    }

    await db.query(
      `ALTER TABLE shifts
       ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
    );

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
