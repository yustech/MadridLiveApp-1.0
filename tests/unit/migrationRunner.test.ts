import { describe, expect, it } from "vitest";
import {
  computeMigrationChecksum,
  getMigrationPlan,
  validateMigrationList,
  type AppliedMigrationRow,
  type VersionedMigration,
} from "../../server/mysql/migrations/runner";

function makeMigration(version: string, source = version): VersionedMigration {
  return {
    version,
    name: `migration_${version}`,
    checksum: computeMigrationChecksum(source),
    up: async () => {},
    verify: async () => {},
  };
}

describe("computeMigrationChecksum", () => {
  it("computes a stable SHA-256 checksum", () => {
    expect(computeMigrationChecksum("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
    expect(computeMigrationChecksum("abc")).toBe(computeMigrationChecksum("abc"));
  });
});

describe("validateMigrationList", () => {
  it("sorts migrations by version and rejects duplicates", () => {
    const first = makeMigration("0001");
    const second = makeMigration("0002");

    expect(validateMigrationList([second, first])).toEqual([first, second]);
    expect(() => validateMigrationList([first, makeMigration("0001", "other")])).toThrow(
      "Duplicate migration version: 0001"
    );
  });
});

describe("getMigrationPlan", () => {
  it("separates already applied migrations from pending migrations", () => {
    const appliedMigration = makeMigration("0000");
    const pendingMigration = makeMigration("0001");
    const rows: AppliedMigrationRow[] = [
      {
        version: appliedMigration.version,
        name: appliedMigration.name,
        checksum: appliedMigration.checksum,
      },
    ];

    const plan = getMigrationPlan([pendingMigration, appliedMigration], rows);

    expect(plan.alreadyApplied.map((migration) => migration.version)).toEqual(["0000"]);
    expect(plan.pending.map((migration) => migration.version)).toEqual(["0001"]);
  });

  it("fails when an applied migration checksum differs from code", () => {
    const migration = makeMigration("0000");
    const rows: AppliedMigrationRow[] = [
      {
        version: "0000",
        name: "migration_0000",
        checksum: computeMigrationChecksum("changed-after-apply"),
      },
    ];

    expect(() => getMigrationPlan([migration], rows)).toThrow(
      "Checksum mismatch for migration 0000"
    );
  });
});
