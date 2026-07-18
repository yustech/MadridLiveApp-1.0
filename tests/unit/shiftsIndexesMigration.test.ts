import { describe, expect, it } from "vitest";
import {
  addShiftsIndexesMigration,
  getMissingShiftIndexNames,
  getRetainedRedundantShiftIndexNames,
  REDUNDANT_SHIFT_INDEXES,
  SHIFT_INDEX_DEFINITIONS,
  verifyShiftIndexesFromRows,
  type ShiftIndexRow,
} from "../../server/mysql/migrations/0001_add_shifts_indexes";
import { MIGRATIONS } from "../../server/mysql/migrations";

function shiftIndexRows(
  definitions: Array<{ name: string; columns: string[] }> = SHIFT_INDEX_DEFINITIONS.map((definition) => ({
    name: definition.name,
    columns: [...definition.columns],
  }))
): ShiftIndexRow[] {
  return definitions.flatMap((definition) =>
    definition.columns.map((columnName, index) => ({
      indexName: definition.name,
      columnName,
      seqInIndex: index + 1,
    }))
  );
}

describe("0001 add shifts indexes migration", () => {
  it("accepts the expected shifts indexes without the redundant worker index", () => {
    const rows = shiftIndexRows();

    expect(getMissingShiftIndexNames(rows)).toEqual([]);
    expect(getRetainedRedundantShiftIndexNames(rows)).toEqual([]);
    expect(() => verifyShiftIndexesFromRows(rows)).not.toThrow();
  });

  it("reports a missing shifts index when the exact indexed columns are not present", () => {
    const rows = shiftIndexRows().filter(
      (row) => row.indexName !== "idx_shifts_worker_status_started"
    );

    expect(getMissingShiftIndexNames(rows)).toEqual(["idx_shifts_worker_status_started"]);
    expect(() => verifyShiftIndexesFromRows(rows)).toThrow("idx_shifts_worker_status_started");
  });

  it("reports the legacy worker-only index when it has not been dropped", () => {
    const rows = [
      ...shiftIndexRows(),
      {
        indexName: REDUNDANT_SHIFT_INDEXES[0],
        columnName: "worker_id",
        seqInIndex: 1,
      },
    ];

    expect(getRetainedRedundantShiftIndexNames(rows)).toEqual(["idx_shifts_worker"]);
    expect(() => verifyShiftIndexesFromRows(rows)).toThrow("idx_shifts_worker");
  });

  it("exposes a stable versioned migration entry", () => {
    expect(addShiftsIndexesMigration).toMatchObject({
      version: "0001",
      name: "add_shifts_indexes",
    });
    expect(addShiftsIndexesMigration.checksum).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("MIGRATIONS", () => {
  it("lists all migrations in version order", () => {
    expect(MIGRATIONS.map((migration) => migration.version)).toEqual(["0000", "0001", "0002", "0003"]);
  });
});
