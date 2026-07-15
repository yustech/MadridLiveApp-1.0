import { baselineCurrentSchemaMigration } from "./0000_baseline_current_schema";
import { validateMigrationList } from "./runner";

export const MIGRATIONS = validateMigrationList([
  baselineCurrentSchemaMigration,
]);

export type { VersionedMigration } from "./runner";
