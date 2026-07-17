import { describe, expect, it } from "vitest";
import {
  BASELINE_BUSINESS_TABLES,
  BASELINE_REQUIRED_COLUMNS,
  getBaselineVerificationErrors,
  verifyBaselineSnapshot,
  type BaselineSchemaSnapshot,
} from "../../server/mysql/migrations/0000_baseline_current_schema";

function baselineSnapshot(overrides: Partial<BaselineSchemaSnapshot> = {}): BaselineSchemaSnapshot {
  return {
    tables: [...BASELINE_BUSINESS_TABLES, "schema_migrations"],
    columns: BASELINE_REQUIRED_COLUMNS.map((columnKey) => {
      const [tableName, columnName] = columnKey.split(".");
      return { tableName, columnName };
    }),
    ...overrides,
  };
}

describe("verifyBaselineSnapshot", () => {
  it("accepts the current four-table business baseline plus technical metadata", () => {
    expect(() => verifyBaselineSnapshot(baselineSnapshot())).not.toThrow();
    expect(getBaselineVerificationErrors(baselineSnapshot())).toEqual([]);
  });

  it("fails when events.dateYear is missing", () => {
    const snapshot = baselineSnapshot({
      columns: baselineSnapshot().columns.filter(
        (row) => `${row.tableName}.${row.columnName}` !== "events.dateYear"
      ),
    });

    expect(() => verifyBaselineSnapshot(snapshot)).toThrow("events.dateYear");
  });

  it("fails when the legacy supervisors business table exists", () => {
    const snapshot = baselineSnapshot({
      tables: [...baselineSnapshot().tables, "supervisors"],
    });

    expect(() => verifyBaselineSnapshot(snapshot)).toThrow("supervisors");
  });

  it("fails when any unexpected business table exists", () => {
    const snapshot = baselineSnapshot({
      tables: [...baselineSnapshot().tables, "venues"],
    });

    expect(() => verifyBaselineSnapshot(snapshot)).toThrow("Unexpected business table(s): venues");
  });

  it("allows event_staff when initSchema creates post-baseline tables before migration checks", () => {
    const snapshot = baselineSnapshot({
      tables: [...baselineSnapshot().tables, "event_staff"],
    });

    expect(() => verifyBaselineSnapshot(snapshot)).not.toThrow();
  });
});
