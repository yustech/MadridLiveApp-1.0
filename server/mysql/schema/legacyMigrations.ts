import { getSchemaStatus } from "./schemaStatus";

export async function applySchemaMigrations(db: any) {
  const status = await getSchemaStatus(db);
  const migrated: string[] = [];

  if (status.missing.includes('shifts.started_at')) {
    await db.query(
      `ALTER TABLE shifts
       ADD COLUMN started_at DATETIME NULL`
    );
    migrated.push('shifts.started_at');
  }

  if (status.missing.includes('shifts.ended_at')) {
    await db.query(
      `ALTER TABLE shifts
       ADD COLUMN ended_at DATETIME NULL`
    );
    migrated.push('shifts.ended_at');
  }

  if (status.missing.includes('shifts.event_title')) {
    const [legacyRows] = await db.query(
      `SELECT COUNT(*) AS total
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'shifts'
         AND column_name = 'location'`
    );
    const legacyExists = Array.isArray(legacyRows) && Number((legacyRows[0] as any)?.total || 0) > 0;
    if (legacyExists) {
      await db.query(
        `ALTER TABLE shifts
         CHANGE COLUMN location event_title VARCHAR(255) NOT NULL`
      );
    } else {
      await db.query(
        `ALTER TABLE shifts
         ADD COLUMN event_title VARCHAR(255) NOT NULL DEFAULT ''`
      );
    }
    migrated.push('shifts.event_title');
  }

  if (status.missing.includes('shifts.event_id')) {
    await db.query(`ALTER TABLE shifts ADD COLUMN event_id VARCHAR(96) NULL`);
    migrated.push('shifts.event_id');
  }

  if (status.missing.includes('shifts.updated_at')) {
    await db.query(
      `ALTER TABLE shifts
       ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP`
    );
    migrated.push('shifts.updated_at');
  }

  if (status.missing.includes('events.dateYear')) {
    await db.query(`ALTER TABLE events ADD COLUMN dateYear VARCHAR(8) NULL AFTER dateMonth`);
    migrated.push('events.dateYear');
  }

  if (!status.missing.includes('events.dateYear') || migrated.includes('events.dateYear')) {
    const [eventYearBackfill] = await db.query(
      `UPDATE events
       SET dateYear = CAST(YEAR(CURRENT_DATE()) AS CHAR)
       WHERE dateYear IS NULL OR TRIM(dateYear) = ''`
    );
    const affectedRows = Number((eventYearBackfill as { affectedRows?: number })?.affectedRows || 0);
    if (affectedRows > 0) {
      migrated.push('events.dateYear_backfill');
    }
  }

  const [staffLocationRows] = await db.query(
    `SELECT IS_NULLABLE AS isNullable
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'staff'
         AND column_name = 'location'
       LIMIT 1`
  );
  const staffLocation = Array.isArray(staffLocationRows) ? staffLocationRows[0] : null;
  if (staffLocation?.isNullable === 'NO') {
    await db.query(
      `ALTER TABLE staff
       MODIFY COLUMN location VARCHAR(255) NULL`
    );
    migrated.push('staff.location_nullable');
  }

  const [staffColumnsRows] = await db.query(
    `SELECT column_name AS columnName
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'staff'
         AND column_name IN ('email', 'phone')`
  );
  const staffColumns = new Set((staffColumnsRows as Array<{ columnName: string }>).map((row) => row.columnName));

  if (!staffColumns.has('email')) {
    await db.query(`ALTER TABLE staff ADD COLUMN email VARCHAR(255) NULL AFTER avatar`);
    migrated.push('staff.email');
  }

  if (!staffColumns.has('phone')) {
    await db.query(`ALTER TABLE staff ADD COLUMN phone VARCHAR(32) NULL AFTER email`);
    migrated.push('staff.phone');
  }

  const [staffAvatarRows] = await db.query(
    `SELECT DATA_TYPE AS dataType, CHARACTER_MAXIMUM_LENGTH AS maxLength
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = 'staff'
         AND column_name = 'avatar'
       LIMIT 1`
  );
  const staffAvatar = Array.isArray(staffAvatarRows) ? staffAvatarRows[0] as { dataType?: string; maxLength?: number | null } : null;
  const avatarType = String(staffAvatar?.dataType || '').toLowerCase();
  const avatarLength = Number(staffAvatar?.maxLength || 0);

  if (avatarType === 'varchar' || (avatarLength > 0 && avatarLength < 65535)) {
    await db.query(`ALTER TABLE staff MODIFY COLUMN avatar TEXT NOT NULL`);
    migrated.push('staff.avatar_text');
  }

  return { migrated };
}
