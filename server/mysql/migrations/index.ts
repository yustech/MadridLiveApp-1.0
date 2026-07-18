import { baselineCurrentSchemaMigration } from "./0000_baseline_current_schema";
import { addShiftsIndexesMigration } from "./0001_add_shifts_indexes";
import { createEventStaffMigration } from "./0002_create_event_staff";
import { createStaffTemplatesMigration } from "./0003_create_staff_templates";
import { validateMigrationList } from "./runner";

export const MIGRATIONS = validateMigrationList([
  baselineCurrentSchemaMigration,
  addShiftsIndexesMigration,
  createEventStaffMigration,
  createStaffTemplatesMigration,
]);

export type { VersionedMigration } from "./runner";
