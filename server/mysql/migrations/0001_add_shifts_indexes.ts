import {
  computeMigrationChecksum,
  type MigrationDb,
  type VersionedMigration,
} from "./runner";

export const SHIFT_INDEX_DEFINITIONS = [
  {
    name: "idx_shifts_worker_status_started",
    columns: ["worker_id", "status", "started_at", "updated_at"],
    createSql: "CREATE INDEX idx_shifts_worker_status_started ON shifts (worker_id, status, started_at, updated_at)",
  },
  {
    name: "idx_shifts_worker_started_ended",
    columns: ["worker_id", "started_at", "ended_at"],
    createSql: "CREATE INDEX idx_shifts_worker_started_ended ON shifts (worker_id, started_at, ended_at)",
  },
  {
    name: "idx_shifts_status_worker",
    columns: ["status", "worker_id"],
    createSql: "CREATE INDEX idx_shifts_status_worker ON shifts (status, worker_id)",
  },
] as const;

export const REDUNDANT_SHIFT_INDEXES = ["idx_shifts_worker"] as const;

export interface ShiftIndexRow {
  indexName: string;
  columnName: string;
  seqInIndex: number | string;
}

const SHIFT_INDEX_CHECKSUM_SOURCE = [
  "0001",
  "add_shifts_indexes",
  ...SHIFT_INDEX_DEFINITIONS.map((definition) => `${definition.name}:${definition.columns.join(",")}`),
  ...REDUNDANT_SHIFT_INDEXES.map((indexName) => `drop:${indexName}`),
].join("\n");

function normalizeIndexRows(rows: ShiftIndexRow[]) {
  const byIndex = new Map<string, Array<{ columnName: string; seqInIndex: number }>>();

  for (const row of rows) {
    const current = byIndex.get(row.indexName) || [];
    current.push({
      columnName: row.columnName,
      seqInIndex: Number(row.seqInIndex),
    });
    byIndex.set(row.indexName, current);
  }

  return byIndex;
}

export function getMissingShiftIndexNames(rows: ShiftIndexRow[]) {
  const byIndex = normalizeIndexRows(rows);
  const missing: string[] = [];

  for (const definition of SHIFT_INDEX_DEFINITIONS) {
    const columns = byIndex
      .get(definition.name)
      ?.sort((left, right) => left.seqInIndex - right.seqInIndex)
      .map((row) => row.columnName);

    if (!columns || columns.join(",") !== definition.columns.join(",")) {
      missing.push(definition.name);
    }
  }

  return missing;
}

export function getRetainedRedundantShiftIndexNames(rows: ShiftIndexRow[]) {
  const byIndex = normalizeIndexRows(rows);
  return REDUNDANT_SHIFT_INDEXES.filter((indexName) => byIndex.has(indexName));
}

export function verifyShiftIndexesFromRows(rows: ShiftIndexRow[]) {
  const missing = getMissingShiftIndexNames(rows);
  const retainedRedundant = getRetainedRedundantShiftIndexNames(rows);
  const errors: string[] = [];

  if (missing.length > 0) {
    errors.push(`Missing shift index(es): ${missing.join(", ")}`);
  }

  if (retainedRedundant.length > 0) {
    errors.push(`Redundant shift index(es) still present: ${retainedRedundant.join(", ")}`);
  }

  if (errors.length > 0) {
    throw new Error(`Shift index migration verification failed: ${errors.join("; ")}`);
  }
}

async function getShiftIndexRows(db: MigrationDb): Promise<ShiftIndexRow[]> {
  const [rows] = await db.query(
    `SELECT index_name AS indexName,
            column_name AS columnName,
            seq_in_index AS seqInIndex
     FROM information_schema.statistics
     WHERE table_schema = DATABASE()
       AND table_name = 'shifts'
     ORDER BY index_name, seq_in_index`
  );

  return Array.isArray(rows) ? rows as ShiftIndexRow[] : [];
}

async function createMissingShiftIndexes(db: MigrationDb) {
  const rows = await getShiftIndexRows(db);
  const existingIndexes = new Set(rows.map((row) => row.indexName));

  // Keep this list in sync with initSchema so newly created and upgraded databases converge.
  for (const definition of SHIFT_INDEX_DEFINITIONS) {
    if (!existingIndexes.has(definition.name)) {
      await db.query(definition.createSql);
    }
  }
}

async function dropRedundantWorkerIndex(db: MigrationDb) {
  const rows = await getShiftIndexRows(db);
  const existingIndexes = new Set(rows.map((row) => row.indexName));
  const allReplacementIndexesExist = SHIFT_INDEX_DEFINITIONS.every((definition) =>
    existingIndexes.has(definition.name)
  );

  if (!allReplacementIndexesExist) {
    return;
  }

  for (const indexName of REDUNDANT_SHIFT_INDEXES) {
    if (existingIndexes.has(indexName)) {
      await db.query(`DROP INDEX ${indexName} ON shifts`);
    }
  }
}

export async function verifyShiftsIndexes(db: MigrationDb) {
  verifyShiftIndexesFromRows(await getShiftIndexRows(db));
}

export const addShiftsIndexesMigration: VersionedMigration = {
  version: "0001",
  name: "add_shifts_indexes",
  checksum: computeMigrationChecksum(SHIFT_INDEX_CHECKSUM_SOURCE),
  up: async (db) => {
    await createMissingShiftIndexes(db);
    await dropRedundantWorkerIndex(db);
  },
  verify: verifyShiftsIndexes,
};
