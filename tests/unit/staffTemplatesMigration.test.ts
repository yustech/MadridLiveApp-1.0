import { describe, expect, it, vi } from "vitest";
import {
  createStaffTemplatesMigration,
  getStaffTemplatesVerificationErrors,
  STAFF_TEMPLATE_MEMBERS_COLUMNS,
  STAFF_TEMPLATES_COLUMNS,
  verifyStaffTemplatesSnapshot,
  type StaffTemplatesSchemaSnapshot,
} from "../../server/mysql/migrations/0003_create_staff_templates";
import { initSchema } from "../../server/mysql/schema/initSchema";
import {
  STAFF_TEMPLATE_MEMBERS_TABLE_DDL,
  STAFF_TEMPLATES_TABLE_DDL,
} from "../../server/mysql/schema/staffTemplatesTables";

function validSnapshot(): StaffTemplatesSchemaSnapshot {
  return {
    tables: [
      { tableName: "staff_template_members", engine: "InnoDB", tableCollation: "utf8mb4_0900_ai_ci" },
      { tableName: "staff_templates", engine: "InnoDB", tableCollation: "utf8mb4_0900_ai_ci" },
    ],
    columns: [
      ...STAFF_TEMPLATE_MEMBERS_COLUMNS.map((column) => ({
        tableName: "staff_template_members" as const,
        columnName: column.name,
        columnType: column.type,
        isNullable: column.nullable,
        columnDefault: null,
      })),
      ...STAFF_TEMPLATES_COLUMNS.map((column) => ({
        tableName: "staff_templates" as const,
        columnName: column.name,
        columnType: column.type,
        isNullable: column.nullable,
        columnDefault: column.name === "created_at" ? "CURRENT_TIMESTAMP" : null,
      })),
    ],
    indexes: [
      { tableName: "staff_template_members", indexName: "PRIMARY", columnName: "template_id", seqInIndex: 1, nonUnique: 0 },
      { tableName: "staff_template_members", indexName: "PRIMARY", columnName: "worker_id", seqInIndex: 2, nonUnique: 0 },
      { tableName: "staff_template_members", indexName: "idx_staff_template_members_worker", columnName: "worker_id", seqInIndex: 1, nonUnique: 1 },
      { tableName: "staff_templates", indexName: "PRIMARY", columnName: "id", seqInIndex: 1, nonUnique: 0 },
    ],
  };
}

describe("0003 create staff templates migration", () => {
  it("accepts the exact relational table shapes and indexes", () => {
    const snapshot = validSnapshot();
    expect(getStaffTemplatesVerificationErrors(snapshot)).toEqual([]);
    expect(() => verifyStaffTemplatesSnapshot(snapshot)).not.toThrow();
  });

  it("reports a malformed member relation", () => {
    const snapshot = validSnapshot();
    snapshot.columns = snapshot.columns.filter((column) => column.columnName !== "assigned_role");
    snapshot.indexes = snapshot.indexes.filter((index) => index.indexName !== "idx_staff_template_members_worker");
    expect(() => verifyStaffTemplatesSnapshot(snapshot)).toThrow("assigned_role");
    expect(() => verifyStaffTemplatesSnapshot(snapshot)).toThrow("idx_staff_template_members_worker");
  });

  it("pins the versioned migration checksum", () => {
    expect(createStaffTemplatesMigration).toMatchObject({
      version: "0003",
      name: "create_staff_templates",
      checksum: "e04ade6bdfd73f0d4db03750a1199b4fcbc4b690b724825be87ea0160aeec8eb",
    });
  });

  it("uses byte-identical DDL in migration up and initSchema", async () => {
    const migrationQuery = vi.fn(async () => [[], []] as [unknown, unknown]);
    const initQuery = vi.fn(async () => undefined);

    await createStaffTemplatesMigration.up({ query: migrationQuery });
    await initSchema({ query: initQuery });

    expect(migrationQuery).toHaveBeenNthCalledWith(1, STAFF_TEMPLATES_TABLE_DDL);
    expect(migrationQuery).toHaveBeenNthCalledWith(2, STAFF_TEMPLATE_MEMBERS_TABLE_DDL);
    expect(initQuery).toHaveBeenCalledWith(STAFF_TEMPLATES_TABLE_DDL);
    expect(initQuery).toHaveBeenCalledWith(STAFF_TEMPLATE_MEMBERS_TABLE_DDL);
  });
});
