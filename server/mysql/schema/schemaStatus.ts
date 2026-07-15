export const REQUIRED_SCHEMA_COLUMNS = [
  'shifts.updated_at',
  'shifts.started_at',
  'shifts.ended_at',
  'shifts.event_id',
  'shifts.event_title',
  'events.dateYear',
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
       AND table_name IN ('events', 'shifts')
       AND column_name IN ('updated_at', 'started_at', 'ended_at', 'event_id', 'event_title', 'dateYear')`
  );

  return getSchemaStatusFromRows(rows as SchemaColumnRow[]);
}
