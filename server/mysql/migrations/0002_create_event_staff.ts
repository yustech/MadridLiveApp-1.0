import { EVENT_STAFF_TABLE_DDL } from "../schema/eventStaffTable";
import {
  computeMigrationChecksum,
  type MigrationDb,
  type VersionedMigration,
} from "./runner";

export const EVENT_STAFF_COLUMNS = [
  { name: "event_id", type: "varchar(96)", nullable: "NO" },
  { name: "worker_id", type: "varchar(96)", nullable: "NO" },
  { name: "assigned_role", type: "varchar(64)", nullable: "NO" },
  { name: "created_at", type: "timestamp", nullable: "NO" },
] as const;

export interface EventStaffTableRow {
  engine: string;
  tableCollation: string;
}

export interface EventStaffColumnRow {
  columnName: string;
  columnType: string;
  isNullable: string;
  columnDefault: string | null;
}

export interface EventStaffIndexRow {
  indexName: string;
  columnName: string;
  seqInIndex: number | string;
  nonUnique: number | string;
}

export interface EventStaffSchemaSnapshot {
  table: EventStaffTableRow | null;
  columns: EventStaffColumnRow[];
  indexes: EventStaffIndexRow[];
}

const EVENT_STAFF_CHECKSUM_SOURCE = [
  "0002",
  "create_event_staff",
  EVENT_STAFF_TABLE_DDL,
].join("\n");

function indexedColumns(rows: EventStaffIndexRow[], indexName: string) {
  return rows
    .filter((row) => row.indexName === indexName)
    .sort((left, right) => Number(left.seqInIndex) - Number(right.seqInIndex))
    .map((row) => row.columnName);
}

export function getEventStaffVerificationErrors(snapshot: EventStaffSchemaSnapshot) {
  const errors: string[] = [];

  if (!snapshot.table) {
    return ["Missing event_staff table"];
  }

  if (snapshot.table.engine.toLowerCase() !== "innodb") {
    errors.push(`event_staff engine must be InnoDB, got ${snapshot.table.engine}`);
  }
  if (!snapshot.table.tableCollation.toLowerCase().startsWith("utf8mb4_")) {
    errors.push(`event_staff collation must use utf8mb4, got ${snapshot.table.tableCollation}`);
  }

  const columnsByName = new Map(snapshot.columns.map((column) => [column.columnName, column]));
  const columnOrder = snapshot.columns.map((column) => column.columnName);
  if (columnOrder.join(",") !== EVENT_STAFF_COLUMNS.map((column) => column.name).join(",")) {
    errors.push(`Invalid event_staff column order: ${columnOrder.join(",") || "missing"}`);
  }
  for (const expected of EVENT_STAFF_COLUMNS) {
    const actual = columnsByName.get(expected.name);
    if (!actual) {
      errors.push(`Missing event_staff column: ${expected.name}`);
      continue;
    }
    if (actual.columnType.toLowerCase() !== expected.type || actual.isNullable !== expected.nullable) {
      errors.push(
        `Invalid event_staff column ${expected.name}: expected ${expected.type} nullable=${expected.nullable}, ` +
        `got ${actual.columnType} nullable=${actual.isNullable}`
      );
    }
    if (expected.name === "created_at") {
      const normalizedDefault = String(actual.columnDefault || "").toLowerCase();
      if (!normalizedDefault.startsWith("current_timestamp")) {
        errors.push(`created_at must default to CURRENT_TIMESTAMP, got ${actual.columnDefault}`);
      }
    } else if (actual.columnDefault !== null) {
      errors.push(`${expected.name} must not define a default value`);
    }
  }

  const primaryColumns = indexedColumns(snapshot.indexes, "PRIMARY");
  if (primaryColumns.join(",") !== "event_id,worker_id") {
    errors.push(`Invalid event_staff primary key: ${primaryColumns.join(",") || "missing"}`);
  }
  const primaryRows = snapshot.indexes.filter((row) => row.indexName === "PRIMARY");
  if (primaryRows.some((row) => Number(row.nonUnique) !== 0)) {
    errors.push("event_staff primary key must be unique");
  }

  const workerIndexColumns = indexedColumns(snapshot.indexes, "idx_event_staff_worker");
  if (workerIndexColumns.join(",") !== "worker_id") {
    errors.push(`Invalid idx_event_staff_worker: ${workerIndexColumns.join(",") || "missing"}`);
  }
  const workerIndexRows = snapshot.indexes.filter((row) => row.indexName === "idx_event_staff_worker");
  if (workerIndexRows.some((row) => Number(row.nonUnique) !== 1)) {
    errors.push("idx_event_staff_worker must be non-unique");
  }

  return errors;
}

export function verifyEventStaffSnapshot(snapshot: EventStaffSchemaSnapshot) {
  const errors = getEventStaffVerificationErrors(snapshot);
  if (errors.length > 0) {
    throw new Error(`event_staff migration verification failed: ${errors.join("; ")}`);
  }
}

async function getEventStaffSchemaSnapshot(db: MigrationDb): Promise<EventStaffSchemaSnapshot> {
  const [tableRows] = await db.query(
    `SELECT engine, table_collation AS tableCollation
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name = 'event_staff'
       AND table_type = 'BASE TABLE'`
  );
  const [columnRows] = await db.query(
    `SELECT column_name AS columnName,
            column_type AS columnType,
            is_nullable AS isNullable,
            column_default AS columnDefault
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name = 'event_staff'
     ORDER BY ordinal_position`
  );
  const [indexRows] = await db.query(
    `SELECT index_name AS indexName,
            column_name AS columnName,
            seq_in_index AS seqInIndex,
            non_unique AS nonUnique
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'event_staff'
     ORDER BY index_name, seq_in_index`
  );

  return {
    table: Array.isArray(tableRows) && tableRows[0]
      ? tableRows[0] as EventStaffTableRow
      : null,
    columns: Array.isArray(columnRows) ? columnRows as EventStaffColumnRow[] : [],
    indexes: Array.isArray(indexRows) ? indexRows as EventStaffIndexRow[] : [],
  };
}

export async function verifyEventStaffTable(db: MigrationDb) {
  verifyEventStaffSnapshot(await getEventStaffSchemaSnapshot(db));
}

export const createEventStaffMigration: VersionedMigration = {
  version: "0002",
  name: "create_event_staff",
  checksum: computeMigrationChecksum(EVENT_STAFF_CHECKSUM_SOURCE),
  up: async (db) => {
    await db.query(EVENT_STAFF_TABLE_DDL);
  },
  verify: verifyEventStaffTable,
};
