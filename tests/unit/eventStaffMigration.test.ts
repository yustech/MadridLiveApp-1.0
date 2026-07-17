import { describe, expect, it, vi } from "vitest";
import {
  createEventStaffMigration,
  EVENT_STAFF_COLUMNS,
  getEventStaffVerificationErrors,
  verifyEventStaffSnapshot,
  type EventStaffSchemaSnapshot,
} from "../../server/mysql/migrations/0002_create_event_staff";
import { initSchema } from "../../server/mysql/schema/initSchema";
import { EVENT_STAFF_TABLE_DDL } from "../../server/mysql/schema/eventStaffTable";

function validSnapshot(): EventStaffSchemaSnapshot {
  return {
    table: { engine: "InnoDB", tableCollation: "utf8mb4_0900_ai_ci" },
    columns: EVENT_STAFF_COLUMNS.map((column) => ({
      columnName: column.name,
      columnType: column.type,
      isNullable: column.nullable,
      columnDefault: column.name === "created_at" ? "CURRENT_TIMESTAMP" : null,
    })),
    indexes: [
      { indexName: "PRIMARY", columnName: "event_id", seqInIndex: 1, nonUnique: 0 },
      { indexName: "PRIMARY", columnName: "worker_id", seqInIndex: 2, nonUnique: 0 },
      { indexName: "idx_event_staff_worker", columnName: "worker_id", seqInIndex: 1, nonUnique: 1 },
    ],
  };
}

describe("0002 create event_staff migration", () => {
  it("accepts the exact table shape, primary key and worker index", () => {
    const snapshot = validSnapshot();

    expect(getEventStaffVerificationErrors(snapshot)).toEqual([]);
    expect(() => verifyEventStaffSnapshot(snapshot)).not.toThrow();
  });

  it("reports missing or malformed schema elements", () => {
    const snapshot = validSnapshot();
    snapshot.columns = snapshot.columns.filter((column) => column.columnName !== "assigned_role");
    snapshot.indexes = snapshot.indexes.filter((index) => index.indexName !== "idx_event_staff_worker");

    expect(() => verifyEventStaffSnapshot(snapshot)).toThrow("assigned_role");
    expect(() => verifyEventStaffSnapshot(snapshot)).toThrow("idx_event_staff_worker");
  });

  it("exposes a stable versioned migration entry", () => {
    expect(createEventStaffMigration).toMatchObject({
      version: "0002",
      name: "create_event_staff",
    });
    expect(createEventStaffMigration.checksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it("uses byte-identical DDL in migration up and initSchema", async () => {
    const migrationQuery = vi.fn(async () => [[], []] as [unknown, unknown]);
    const initQuery = vi.fn(async () => undefined);

    await createEventStaffMigration.up({ query: migrationQuery });
    await initSchema({ query: initQuery });

    expect(migrationQuery).toHaveBeenCalledWith(EVENT_STAFF_TABLE_DDL);
    expect(initQuery).toHaveBeenCalledWith(EVENT_STAFF_TABLE_DDL);
  });
});
