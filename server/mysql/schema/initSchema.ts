import { EVENT_STAFF_TABLE_DDL } from "./eventStaffTable";
import {
  STAFF_TEMPLATE_MEMBERS_TABLE_DDL,
  STAFF_TEMPLATES_TABLE_DDL,
} from "./staffTemplatesTables";

interface SchemaInitDb {
  query: (sql: string) => Promise<unknown>;
}

export async function initSchema(db: SchemaInitDb) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS staff (
      id VARCHAR(96) PRIMARY KEY,
      idCode VARCHAR(20) NOT NULL,
      name VARCHAR(255) NOT NULL,
      role VARCHAR(64) NOT NULL,
      roleLabel VARCHAR(96) NOT NULL,
      status VARCHAR(16) NOT NULL,
      checkedInTime VARCHAR(32) NULL,
      lastSeen VARCHAR(128) NULL,
      avatar TEXT NOT NULL,
      email VARCHAR(255) NULL,
      phone VARCHAR(32) NULL,
      totalHours DECIMAL(10,2) NOT NULL DEFAULT 0,
      currentShiftHours INT NOT NULL DEFAULT 0,
      currentShiftMins INT NOT NULL DEFAULT 0,
      location VARCHAR(255) NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS events (
      id VARCHAR(96) PRIMARY KEY,
      title VARCHAR(255) NOT NULL,
      location VARCHAR(255) NOT NULL,
      dateDay VARCHAR(8) NOT NULL,
      dateMonth VARCHAR(16) NOT NULL,
      dateYear VARCHAR(8) NULL,
      doorsOpen VARCHAR(32) NOT NULL,
      required_staff INT NOT NULL,
      active_staff INT NOT NULL,
      total_staff_needed INT NOT NULL,
      scan_rate INT NOT NULL,
      load_in_percent INT NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  // Keep this byte-for-byte identical to migration 0002 for fresh/upgraded schema parity.
  await db.query(EVENT_STAFF_TABLE_DDL);

  // Keep these byte-for-byte identical to migration 0003 for fresh/upgraded schema parity.
  await db.query(STAFF_TEMPLATES_TABLE_DDL);
  await db.query(STAFF_TEMPLATE_MEMBERS_TABLE_DDL);

  await db.query(`
    CREATE TABLE IF NOT EXISTS shifts (
      id VARCHAR(96) PRIMARY KEY,
      worker_id VARCHAR(96) NOT NULL,
      date_string VARCHAR(64) NOT NULL,
      timespan VARCHAR(128) NOT NULL,
      duration_label VARCHAR(64) NOT NULL,
      event_id VARCHAR(96) NULL,
      event_title VARCHAR(255) NOT NULL,
      status VARCHAR(32) NOT NULL,
      started_at DATETIME NULL,
      ended_at DATETIME NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_shifts_worker_status_started (worker_id, status, started_at, updated_at),
      INDEX idx_shifts_worker_started_ended (worker_id, started_at, ended_at),
      INDEX idx_shifts_status_worker (status, worker_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);

  await db.query(`
    CREATE TABLE IF NOT EXISTS alerts (
      id VARCHAR(96) PRIMARY KEY,
      message TEXT NOT NULL,
      zone VARCHAR(128) NOT NULL,
      timestamp_label VARCHAR(64) NOT NULL,
      severity VARCHAR(16) NOT NULL,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}
