import dotenv from 'dotenv';
import mysql from 'mysql2/promise';
import { INITIAL_EVENTS, INITIAL_STAFF, INITIAL_SHIFTS, INITIAL_ALERTS } from '../src/data';

dotenv.config({ path: '/opt/madridlive-app/.env' });

async function main() {
  const db = await mysql.createConnection({
    host: process.env.MYSQL_HOST,
    port: Number(process.env.MYSQL_PORT || 3306),
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASSWORD || '',
    database: process.env.MYSQL_DATABASE,
    timezone: 'Z',
  });

  const getTableColumns = async (tableName: string) => {
    const [rows] = await db.query(
      `SELECT column_name AS columnName
       FROM information_schema.columns
       WHERE table_schema = DATABASE()
         AND table_name = ?`,
      [tableName]
    );
    return new Set((rows as Array<{ columnName: string }>).map((row) => row.columnName));
  };

  const eventColumns = await getTableColumns('events');

  await db.beginTransaction();

  await db.execute('DELETE FROM shifts');
  await db.execute('DELETE FROM alerts');
  await db.execute('DELETE FROM events');
  await db.execute('DELETE FROM staff');

  for (const s of INITIAL_STAFF) {
    await db.execute(
      `INSERT INTO staff (id, id_code, name, role, role_label, status, checked_in_time, last_seen, avatar, total_hours, current_shift_hours, current_shift_mins, location)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        s.id,
        s.idCode,
        s.name,
        s.role,
        s.roleLabel,
        s.status,
        s.checkedInTime || null,
        s.lastSeen || null,
        s.avatar || '',
        Number(s.totalHours || 0),
        Number(s.currentShiftHours || 0),
        Number(s.currentShiftMins || 0),
        s.location || '',
      ]
    );
  }

  for (const e of INITIAL_EVENTS) {
    const insertColumns: string[] = ['id', 'title', 'location'];
    const insertValues: unknown[] = [e.id, e.title, e.location];

    const pushEventColumnValue = (columnName: string, value: unknown) => {
      if (!eventColumns.has(columnName)) return;
      insertColumns.push(columnName);
      insertValues.push(value);
    };

    pushEventColumnValue('dateDay', e.dateDay);
    pushEventColumnValue('date_day', e.dateDay);
    pushEventColumnValue('dateMonth', e.dateMonth);
    pushEventColumnValue('date_month', e.dateMonth);
    pushEventColumnValue('dateYear', e.dateYear);
    pushEventColumnValue('date_year', e.dateYear);
    pushEventColumnValue('doorsOpen', e.doorsOpen);
    pushEventColumnValue('doors_open', e.doorsOpen);
    pushEventColumnValue('requiredStaff', Number(e.requiredStaff || 0));
    pushEventColumnValue('required_staff', Number(e.requiredStaff || 0));
    pushEventColumnValue('activeStaff', Number(e.activeStaff || 0));
    pushEventColumnValue('active_staff', Number(e.activeStaff || 0));
    pushEventColumnValue('totalStaffNeeded', Number(e.totalStaffNeeded || 0));
    pushEventColumnValue('total_staff_needed', Number(e.totalStaffNeeded || 0));
    pushEventColumnValue('scanRate', Number(e.scanRate || 0));
    pushEventColumnValue('scan_rate', Number(e.scanRate || 0));
    pushEventColumnValue('loadInPercent', Number(e.loadInPercent || 0));
    pushEventColumnValue('load_in_percent', Number(e.loadInPercent || 0));

    await db.execute(
      `INSERT INTO events (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
      insertValues
    );
  }

  const eventIdByTitle = new Map(INITIAL_EVENTS.map((event) => [event.title, event.id] as const));

  for (const sh of INITIAL_SHIFTS) {
    await db.execute(
      `INSERT INTO shifts (id, worker_id, date_string, timespan, duration_label, event_id, event_title, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [sh.id, sh.workerId, sh.dateString, sh.timespan, sh.durationLabel, eventIdByTitle.get(sh.eventTitle) || null, sh.eventTitle, sh.status]
    );
  }
  for (const a of INITIAL_ALERTS) {
    await db.execute(
      `INSERT INTO alerts (id, message, zone, timestamp_label, severity)
       VALUES (?, ?, ?, ?, ?)`,
      [a.id, a.message, a.zone, a.timestamp, a.severity]
    );
  }

  await db.commit();

  const [rows] = await db.query(
    `SELECT 'staff' AS table_name, COUNT(*) AS total FROM staff
     UNION ALL SELECT 'events', COUNT(*) FROM events
     UNION ALL SELECT 'shifts', COUNT(*) FROM shifts
     UNION ALL SELECT 'alerts', COUNT(*) FROM alerts`
  );

  console.log(
    `expected staff=${INITIAL_STAFF.length}, events=${INITIAL_EVENTS.length}, shifts=${INITIAL_SHIFTS.length}, alerts=${INITIAL_ALERTS.length}`
  );
  console.log(rows);

  await db.end();
}

main().catch(async (error) => {
  console.error(error);
  process.exit(1);
});
