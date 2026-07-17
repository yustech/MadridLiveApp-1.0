export const EVENT_STAFF_TABLE_DDL = `
    CREATE TABLE IF NOT EXISTS event_staff (
      event_id VARCHAR(96) NOT NULL,
      worker_id VARCHAR(96) NOT NULL,
      assigned_role VARCHAR(64) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (event_id, worker_id),
      INDEX idx_event_staff_worker (worker_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
