import {
  STAFF_TEMPLATE_MEMBERS_TABLE_DDL,
  STAFF_TEMPLATES_TABLE_DDL,
} from "../schema/staffTemplatesTables";
import {
  computeMigrationChecksum,
  type MigrationDb,
  type VersionedMigration,
} from "./runner";

export const STAFF_TEMPLATES_COLUMNS = [
  { name: "id", type: "varchar(96)", nullable: "NO" },
  { name: "name", type: "varchar(160)", nullable: "NO" },
  { name: "created_at", type: "timestamp", nullable: "NO" },
] as const;

export const STAFF_TEMPLATE_MEMBERS_COLUMNS = [
  { name: "template_id", type: "varchar(96)", nullable: "NO" },
  { name: "worker_id", type: "varchar(96)", nullable: "NO" },
  { name: "assigned_role", type: "varchar(64)", nullable: "NO" },
] as const;

type TemplateTableName = "staff_templates" | "staff_template_members";

export interface StaffTemplateTableRow {
  tableName: TemplateTableName;
  engine: string;
  tableCollation: string;
}

export interface StaffTemplateColumnRow {
  tableName: TemplateTableName;
  columnName: string;
  columnType: string;
  isNullable: string;
  columnDefault: string | null;
}

export interface StaffTemplateIndexRow {
  tableName: TemplateTableName;
  indexName: string;
  columnName: string;
  seqInIndex: number | string;
  nonUnique: number | string;
}

export interface StaffTemplatesSchemaSnapshot {
  tables: StaffTemplateTableRow[];
  columns: StaffTemplateColumnRow[];
  indexes: StaffTemplateIndexRow[];
}

const STAFF_TEMPLATES_CHECKSUM_SOURCE = [
  "0003",
  "create_staff_templates",
  STAFF_TEMPLATES_TABLE_DDL,
  STAFF_TEMPLATE_MEMBERS_TABLE_DDL,
].join("\n");

function indexedColumns(rows: StaffTemplateIndexRow[], tableName: TemplateTableName, indexName: string) {
  return rows
    .filter((row) => row.tableName === tableName && row.indexName === indexName)
    .sort((left, right) => Number(left.seqInIndex) - Number(right.seqInIndex))
    .map((row) => row.columnName);
}

export function getStaffTemplatesVerificationErrors(snapshot: StaffTemplatesSchemaSnapshot) {
  const errors: string[] = [];
  const expectedTables: Array<{
    name: TemplateTableName;
    columns: ReadonlyArray<{ name: string; type: string; nullable: string }>;
    primary: string[];
  }> = [
    { name: "staff_templates", columns: STAFF_TEMPLATES_COLUMNS, primary: ["id"] },
    {
      name: "staff_template_members",
      columns: STAFF_TEMPLATE_MEMBERS_COLUMNS,
      primary: ["template_id", "worker_id"],
    },
  ];

  for (const expectedTable of expectedTables) {
    const table = snapshot.tables.find((row) => row.tableName === expectedTable.name);
    if (!table) {
      errors.push(`Missing ${expectedTable.name} table`);
      continue;
    }
    if (table.engine.toLowerCase() !== "innodb") {
      errors.push(`${expectedTable.name} engine must be InnoDB, got ${table.engine}`);
    }
    if (!table.tableCollation.toLowerCase().startsWith("utf8mb4_")) {
      errors.push(`${expectedTable.name} collation must use utf8mb4, got ${table.tableCollation}`);
    }

    const columns = snapshot.columns.filter((column) => column.tableName === expectedTable.name);
    const columnOrder = columns.map((column) => column.columnName);
    if (columnOrder.join(",") !== expectedTable.columns.map((column) => column.name).join(",")) {
      errors.push(`Invalid ${expectedTable.name} column order: ${columnOrder.join(",") || "missing"}`);
    }
    const columnsByName = new Map(columns.map((column) => [column.columnName, column]));
    for (const expectedColumn of expectedTable.columns) {
      const actual = columnsByName.get(expectedColumn.name);
      if (!actual) {
        errors.push(`Missing ${expectedTable.name} column: ${expectedColumn.name}`);
        continue;
      }
      if (actual.columnType.toLowerCase() !== expectedColumn.type || actual.isNullable !== expectedColumn.nullable) {
        errors.push(
          `Invalid ${expectedTable.name}.${expectedColumn.name}: expected ${expectedColumn.type} ` +
          `nullable=${expectedColumn.nullable}, got ${actual.columnType} nullable=${actual.isNullable}`
        );
      }
      if (expectedTable.name === "staff_templates" && expectedColumn.name === "created_at") {
        if (!String(actual.columnDefault || "").toLowerCase().startsWith("current_timestamp")) {
          errors.push(`staff_templates.created_at must default to CURRENT_TIMESTAMP, got ${actual.columnDefault}`);
        }
      } else if (actual.columnDefault !== null) {
        errors.push(`${expectedTable.name}.${expectedColumn.name} must not define a default value`);
      }
    }

    const primaryColumns = indexedColumns(snapshot.indexes, expectedTable.name, "PRIMARY");
    if (primaryColumns.join(",") !== expectedTable.primary.join(",")) {
      errors.push(`Invalid ${expectedTable.name} primary key: ${primaryColumns.join(",") || "missing"}`);
    }
    const primaryRows = snapshot.indexes.filter(
      (row) => row.tableName === expectedTable.name && row.indexName === "PRIMARY"
    );
    if (primaryRows.some((row) => Number(row.nonUnique) !== 0)) {
      errors.push(`${expectedTable.name} primary key must be unique`);
    }
  }

  const workerIndex = indexedColumns(
    snapshot.indexes,
    "staff_template_members",
    "idx_staff_template_members_worker"
  );
  if (workerIndex.join(",") !== "worker_id") {
    errors.push(`Invalid idx_staff_template_members_worker: ${workerIndex.join(",") || "missing"}`);
  }
  const workerIndexRows = snapshot.indexes.filter(
    (row) => row.tableName === "staff_template_members" && row.indexName === "idx_staff_template_members_worker"
  );
  if (workerIndexRows.some((row) => Number(row.nonUnique) !== 1)) {
    errors.push("idx_staff_template_members_worker must be non-unique");
  }

  return errors;
}

export function verifyStaffTemplatesSnapshot(snapshot: StaffTemplatesSchemaSnapshot) {
  const errors = getStaffTemplatesVerificationErrors(snapshot);
  if (errors.length > 0) {
    throw new Error(`staff templates migration verification failed: ${errors.join("; ")}`);
  }
}

async function getStaffTemplatesSchemaSnapshot(db: MigrationDb): Promise<StaffTemplatesSchemaSnapshot> {
  const [tableRows] = await db.query(
    `SELECT table_name AS tableName, engine AS engine, table_collation AS tableCollation
     FROM information_schema.tables
     WHERE table_schema = DATABASE()
       AND table_name IN ('staff_templates', 'staff_template_members')
       AND table_type = 'BASE TABLE'
     ORDER BY table_name`
  );
  const [columnRows] = await db.query(
    `SELECT table_name AS tableName,
            column_name AS columnName,
            column_type AS columnType,
            is_nullable AS isNullable,
            column_default AS columnDefault
     FROM information_schema.columns
     WHERE table_schema = DATABASE()
       AND table_name IN ('staff_templates', 'staff_template_members')
     ORDER BY table_name, ordinal_position`
  );
  const [indexRows] = await db.query(
    `SELECT table_name AS tableName,
            index_name AS indexName,
            column_name AS columnName,
            seq_in_index AS seqInIndex,
            non_unique AS nonUnique
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name IN ('staff_templates', 'staff_template_members')
     ORDER BY table_name, index_name, seq_in_index`
  );

  return {
    tables: Array.isArray(tableRows) ? tableRows as StaffTemplateTableRow[] : [],
    columns: Array.isArray(columnRows) ? columnRows as StaffTemplateColumnRow[] : [],
    indexes: Array.isArray(indexRows) ? indexRows as StaffTemplateIndexRow[] : [],
  };
}

export async function verifyStaffTemplatesTables(db: MigrationDb) {
  verifyStaffTemplatesSnapshot(await getStaffTemplatesSchemaSnapshot(db));
}

export const createStaffTemplatesMigration: VersionedMigration = {
  version: "0003",
  name: "create_staff_templates",
  checksum: computeMigrationChecksum(STAFF_TEMPLATES_CHECKSUM_SOURCE),
  up: async (db) => {
    await db.query(STAFF_TEMPLATES_TABLE_DDL);
    await db.query(STAFF_TEMPLATE_MEMBERS_TABLE_DDL);
  },
  verify: verifyStaffTemplatesTables,
};
