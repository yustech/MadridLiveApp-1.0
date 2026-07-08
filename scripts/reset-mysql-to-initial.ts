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
  });

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
    await db.execute(
      `INSERT INTO events (id, title, location, date_day, date_month, doors_open, required_staff, active_staff, total_staff_needed, scan_rate, load_in_percent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id,
        e.title,
        e.location,
        e.dateDay,
        e.dateMonth,
        e.doorsOpen,
        Number(e.requiredStaff || 0),
        Number(e.activeStaff || 0),
        Number(e.totalStaffNeeded || 0),
        Number(e.scanRate || 0),
        Number(e.loadInPercent || 0),
      ]
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
