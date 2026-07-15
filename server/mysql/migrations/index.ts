import { baselineCurrentSchemaMigration } from "./0000_baseline_current_schema";
import { addShiftsIndexesMigration } from "./0001_add_shifts_indexes";
import { validateMigrationList } from "./runner";

export const MIGRATIONS = validateMigrationList([
  baselineCurrentSchemaMigration,
  addShiftsIndexesMigration,
]);

export type { VersionedMigration } from "./runner";
