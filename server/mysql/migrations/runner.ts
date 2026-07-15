import { createHash } from "node:crypto";
import { getSchemaStatus, type SchemaStatus } from "../schema/schemaStatus";

export const SCHEMA_MIGRATIONS_TABLE = "schema_migrations";
export const MIGRATION_LOCK_NAME = "madridlive_schema_migrations";

export interface MigrationDb {
  query: (sql: string, values?: unknown[]) => Promise<[unknown, unknown?]>;
}

export interface MigrationConnection extends MigrationDb {
  release?: () => void;
}

export interface MigrationPool {
  getConnection: () => Promise<MigrationConnection>;
}

export interface VersionedMigration {
  version: string;
  name: string;
  checksum: string;
  up: (db: MigrationDb) => Promise<void>;
  verify: (db: MigrationDb) => Promise<void>;
}

export interface AppliedMigrationRow {
  version: string;
  name: string;
  checksum: string;
}

export interface MigrationPlan {
  alreadyApplied: VersionedMigration[];
  pending: VersionedMigration[];
}

export interface AppliedMigrationSummary {
  version: string;
  name: string;
  checksum: string;
  executionMs: number;
}

export interface MigrationRunSummary {
  applied: AppliedMigrationSummary[];
  alreadyApplied: string[];
  pending: string[];
  durationMs: number;
  schemaStatus: SchemaStatus;
}

export interface RunVersionedMigrationsOptions {
  lockTimeoutSeconds?: number;
  appVersion?: string | null;
}

export function computeMigrationChecksum(source: string) {
  return createHash("sha256").update(source).digest("hex");
}

export function validateMigrationList(migrations: VersionedMigration[]) {
  const sorted = [...migrations].sort((left, right) => left.version.localeCompare(right.version));
  const seen = new Set<string>();

  for (const migration of sorted) {
    if (seen.has(migration.version)) {
      throw new Error(`Duplicate migration version: ${migration.version}`);
    }
    seen.add(migration.version);
  }

  return sorted;
}

export function getMigrationPlan(
  migrations: VersionedMigration[],
  appliedRows: AppliedMigrationRow[]
): MigrationPlan {
  const appliedByVersion = new Map(appliedRows.map((row) => [row.version, row]));
  const alreadyApplied: VersionedMigration[] = [];
  const pending: VersionedMigration[] = [];

  for (const migration of validateMigrationList(migrations)) {
    const applied = appliedByVersion.get(migration.version);

    if (!applied) {
      pending.push(migration);
      continue;
    }

    if (applied.checksum !== migration.checksum) {
      throw new Error(
        `Checksum mismatch for migration ${migration.version}: database=${applied.checksum} code=${migration.checksum}`
      );
    }

    alreadyApplied.push(migration);
  }

  return { alreadyApplied, pending };
}

export async function ensureSchemaMigrationsTable(db: MigrationDb) {
  await db.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version VARCHAR(32) PRIMARY KEY,
      name VARCHAR(160) NOT NULL,
      checksum CHAR(64) NOT NULL,
      applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      execution_ms INT NOT NULL DEFAULT 0,
      app_version VARCHAR(64) NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function readAppliedMigrations(db: MigrationDb): Promise<AppliedMigrationRow[]> {
  const [rows] = await db.query(
    `SELECT version, name, checksum
     FROM schema_migrations
     ORDER BY version`
  );

  return Array.isArray(rows) ? rows as AppliedMigrationRow[] : [];
}

async function acquireMigrationLock(db: MigrationDb, timeoutSeconds: number) {
  const [rows] = await db.query(
    `SELECT GET_LOCK(?, ?) AS acquired`,
    [MIGRATION_LOCK_NAME, timeoutSeconds]
  );
  const firstRow = Array.isArray(rows) ? rows[0] as { acquired?: number | string | null } : null;
  const acquired = Number(firstRow?.acquired ?? 0);

  if (acquired !== 1) {
    throw new Error(`Could not acquire schema migration lock: ${MIGRATION_LOCK_NAME}`);
  }
}

async function releaseMigrationLock(db: MigrationDb) {
  await db.query(
    `SELECT RELEASE_LOCK(?) AS released`,
    [MIGRATION_LOCK_NAME]
  );
}

export async function runVersionedMigrations(
  pool: MigrationPool,
  migrations: VersionedMigration[],
  options: RunVersionedMigrationsOptions = {}
): Promise<MigrationRunSummary> {
  const startedAt = Date.now();
  const connection = await pool.getConnection();
  const sortedMigrations = validateMigrationList(migrations);
  const lockTimeoutSeconds = options.lockTimeoutSeconds ?? 10;
  const appVersion = options.appVersion ?? process.env.npm_package_version ?? null;
  const applied: AppliedMigrationSummary[] = [];
  let lockAcquired = false;
  let operationError: unknown;

  try {
    await acquireMigrationLock(connection, lockTimeoutSeconds);
    lockAcquired = true;

    await ensureSchemaMigrationsTable(connection);

    const initialAppliedRows = await readAppliedMigrations(connection);
    const initialPlan = getMigrationPlan(sortedMigrations, initialAppliedRows);

    for (const migration of initialPlan.pending) {
      const migrationStartedAt = Date.now();

      await migration.up(connection);
      await migration.verify(connection);

      const executionMs = Date.now() - migrationStartedAt;
      await connection.query(
        `INSERT INTO schema_migrations (version, name, checksum, execution_ms, app_version)
         VALUES (?, ?, ?, ?, ?)`,
        [migration.version, migration.name, migration.checksum, executionMs, appVersion]
      );

      applied.push({
        version: migration.version,
        name: migration.name,
        checksum: migration.checksum,
        executionMs,
      });
    }

    const finalAppliedRows = await readAppliedMigrations(connection);
    const finalPlan = getMigrationPlan(sortedMigrations, finalAppliedRows);
    const schemaStatus = await getSchemaStatus({
      query: async (sql) => {
        const [rows] = await connection.query(sql);
        return [rows];
      },
    });

    return {
      applied,
      alreadyApplied: initialPlan.alreadyApplied.map((migration) => migration.version),
      pending: finalPlan.pending.map((migration) => migration.version),
      durationMs: Date.now() - startedAt,
      schemaStatus,
    };
  } catch (error) {
    operationError = error;
    throw error;
  } finally {
    try {
      if (lockAcquired) {
        await releaseMigrationLock(connection);
      }
    } catch (releaseError) {
      if (!operationError) {
        throw releaseError;
      }
    } finally {
      if (typeof connection.release === "function") {
        connection.release();
      }
    }
  }
}
