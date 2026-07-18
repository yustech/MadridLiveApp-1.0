export const STAFF_TEMPLATES_TABLE_DDL = `
    CREATE TABLE IF NOT EXISTS staff_templates (
      id VARCHAR(96) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;

export const STAFF_TEMPLATE_MEMBERS_TABLE_DDL = `
    CREATE TABLE IF NOT EXISTS staff_template_members (
      template_id VARCHAR(96) NOT NULL,
      worker_id VARCHAR(96) NOT NULL,
      assigned_role VARCHAR(64) NOT NULL,
      PRIMARY KEY (template_id, worker_id),
      INDEX idx_staff_template_members_worker (worker_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `;
