import {
  computeMigrationChecksum,
  ensureSchemaMigrationsTable,
  type MigrationDb,
  type VersionedMigration,
} from "./runner";

export const BASELINE_BUSINESS_TABLES = ["staff", "events", "shifts", "alerts"] as const;
export const POST_BASELINE_BUSINESS_TABLES = [
  "event_staff",
  "staff_templates",
  "staff_template_members",
] as const;
export const TECHNICAL_TABLES = ["schema_migrations"] as const;

export const BASELINE_REQUIRED_COLUMNS = [
  "staff.id",
  "staff.idCode",
  "staff.name",
  "staff.role",
  "staff.roleLabel",
  "staff.status",
  "staff.checkedInTime",
  "staff.lastSeen",
  "staff.avatar",
  "staff.email",
  "staff.phone",
  "staff.totalHours",
  "staff.currentShiftHours",
  "staff.currentShiftMins",
  "staff.location",
  "staff.updated_at",
  "events.id",
  "events.title",
  "events.location",
  "events.dateDay",
  "events.dateMonth",
  "events.dateYear",
  "events.doorsOpen",
  "events.required_staff",
  "events.active_staff",
  "events.total_staff_needed",
  "events.scan_rate",
  "events.load_in_percent",
  "events.updated_at",
  "shifts.id",
  "shifts.worker_id",
  "shifts.date_string",
  "shifts.timespan",
  "shifts.duration_label",
  "shifts.event_id",
  "shifts.event_title",
  "shifts.status",
  "shifts.started_at",
  "shifts.ended_at",
  "shifts.updated_at",
  "alerts.id",
  "alerts.message",
  "alerts.zone",
  "alerts.timestamp_label",
  "alerts.severity",
  "alerts.updated_at",
];

export interface BaselineColumnRow {
  tableName: string;
  columnName: string;
}

export interface BaselineSchemaSnapshot {
  tables: string[];
  columns: BaselineColumnRow[];
}

const BASELINE_CHECKSUM_SOURCE = [
  "0000",
  "baseline_current_schema",
  ...BASELINE_BUSINESS_TABLES,
  ...BASELINE_REQUIRED_COLUMNS,
].join("\n");

export function getBaselineVerificationErrors(snapshot: BaselineSchemaSnapshot) {
  const expectedBusinessTables = new Set<string>(BASELINE_BUSINESS_TABLES);
  const technicalTables = new Set<string>(TECHNICAL_TABLES);
  const postBaselineTables = new Set<string>(POST_BASELINE_BUSINESS_TABLES);
  const foundTables = new Set(snapshot.tables);
  const businessTables = [...foundTables].filter((tableName) => !technicalTables.has(tableName));
  const businessTableSet = new Set(businessTables);
  const missingTables = BASELINE_BUSINESS_TABLES.filter((tableName) => !foundTables.has(tableName));
  const unexpectedTables = businessTables.filter(
    (tableName) => !expectedBusinessTables.has(tableName) && !postBaselineTables.has(tableName)
  );
  const foundColumns = new Set(
    snapshot.columns.map((row) => `${row.tableName}.${row.columnName}`)
  );
  const missingColumns = BASELINE_REQUIRED_COLUMNS.filter((columnKey) => !foundColumns.has(columnKey));
  const errors: string[] = [];

  if (missingTables.length > 0) {
    errors.push(`Missing business table(s): ${missingTables.join(", ")}`);
  }

  if (businessTableSet.has("supervisors")) {
    errors.push("Legacy business table 'supervisors' must not exist before recording baseline 0000");
  }

  if (unexpectedTables.length > 0) {
    errors.push(
      `Unexpected business table(s): ${unexpectedTables.join(", ")}. Only staff, events, shifts and alerts are allowed before baseline 0000`
    );
  }

  if (missingColumns.length > 0) {
    errors.push(`Missing baseline column(s): ${missingColumns.join(", ")}`);
  }

  return errors;
}

export function verifyBaselineSnapshot(snapshot: BaselineSchemaSnapshot) {
  const errors = getBaselineVerificationErrors(snapshot);

  if (errors.length > 0) {
    throw new Error(`Baseline schema verification failed: ${errors.join("; ")}`);
  }
}

async function getBaselineSchemaSnapshot(db: MigrationDb): Promise<BaselineSchemaSnapshot> {
  const [tableRows] = await db.query(
    `SELECT table_name AS tableName
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_type = 'BASE TABLE'`
  );
  const [columnRows] = await db.query(
    `SELECT table_name AS tableName, column_name AS columnName
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name IN ('staff', 'events', 'shifts', 'alerts')`
  );

  return {
    tables: Array.isArray(tableRows)
      ? (tableRows as Array<{ tableName: string }>).map((row) => row.tableName)
      : [],
    columns: Array.isArray(columnRows) ? columnRows as BaselineColumnRow[] : [],
  };
}

export async function verifyBaselineCurrentSchema(db: MigrationDb) {
  verifyBaselineSnapshot(await getBaselineSchemaSnapshot(db));
}

export const baselineCurrentSchemaMigration: VersionedMigration = {
  version: "0000",
  name: "baseline_current_schema",
  checksum: computeMigrationChecksum(BASELINE_CHECKSUM_SOURCE),
  up: async (db) => {
    await ensureSchemaMigrationsTable(db);
  },
  verify: verifyBaselineCurrentSchema,
};
