export const REQUIRED_SCHEMA_COLUMNS = [
  'staff.rating',
  'shifts.updated_at',
  'shifts.started_at',
  'shifts.ended_at',
  'shifts.event_id',
  'shifts.event_title',
  'events.dateYear',
  'event_staff.event_id',
  'event_staff.worker_id',
  'event_staff.assigned_role',
  'event_staff.created_at',
  'staff_templates.id',
  'staff_templates.name',
  'staff_templates.created_at',
  'staff_template_members.template_id',
  'staff_template_members.worker_id',
  'staff_template_members.assigned_role',
  'users.id',
  'users.email',
  'users.password_hash',
  'users.role',
  'users.status',
  'users.token_version',
];

export interface SchemaColumnRow {
  tableName: string;
  columnName: string;
}

export interface SchemaStatus {
  ok: boolean;
  required: string[];
  missing: string[];
}

export interface SchemaStatusDb {
  query: (sql: string) => Promise<[unknown]>;
}

export function getMissingSchemaColumns(
  rows: SchemaColumnRow[],
  required: string[] = REQUIRED_SCHEMA_COLUMNS
) {
  const found = new Set(rows.map((row) => `${row.tableName}.${row.columnName}`));
  return required.filter((key) => !found.has(key));
}

export function getSchemaStatusFromRows(
  rows: SchemaColumnRow[],
  required: string[] = REQUIRED_SCHEMA_COLUMNS
): SchemaStatus {
  const missing = getMissingSchemaColumns(rows, required);

  return {
    ok: missing.length === 0,
    required,
    missing,
  };
}

export async function getSchemaStatus(db: SchemaStatusDb): Promise<SchemaStatus> {
  const [rows] = await db.query(
    `SELECT table_name AS tableName, column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name IN ('staff', 'events', 'shifts', 'event_staff', 'staff_templates', 'staff_template_members', 'users')
       AND column_name IN (
         'updated_at', 'started_at', 'ended_at', 'event_id', 'event_title', 'dateYear',
         'worker_id', 'assigned_role', 'created_at', 'id', 'name', 'template_id', 'rating',
         'email', 'password_hash', 'role', 'status', 'token_version'
       )`
  );

  return getSchemaStatusFromRows(rows as SchemaColumnRow[]);
}
