import { describe, expect, it } from "vitest";
import {
  PURGE_COLLECTION_KEYS,
  PURGE_PROTECTED_TABLES,
  executePurge,
  resolvePurgeTables,
} from "../../server/mysql/purge";

describe("resolvePurgeTables", () => {
  it("maps single collections to their tables", () => {
    expect(resolvePurgeTables(["staff"])).toEqual(["staff"]);
    expect(resolvePurgeTables(["alerts"])).toEqual(["alerts"]);
    expect(resolvePurgeTables(["convocatorias"])).toEqual(["event_staff"]);
  });

  it("expands plantillas to members-before-parent", () => {
    expect(resolvePurgeTables(["plantillas"])).toEqual([
      "staff_template_members",
      "staff_templates",
    ]);
  });

  it("returns every business table in child-before-parent order for a full selection", () => {
    const tables = resolvePurgeTables([
      "staff",
      "events",
      "shifts",
      "alerts",
      "convocatorias",
      "plantillas",
    ]);
    expect(tables).toEqual([
      "shifts",
      "alerts",
      "event_staff",
      "staff_template_members",
      "staff_templates",
      "events",
      "staff",
    ]);
  });

  it("deduplicates and trims collection keys", () => {
    expect(resolvePurgeTables(["shifts", " shifts ", "shifts"])).toEqual(["shifts"]);
  });

  it("never resolves to a protected table, even across the full selection", () => {
    const tables = resolvePurgeTables([...PURGE_COLLECTION_KEYS]);
    for (const protectedTable of PURGE_PROTECTED_TABLES) {
      expect(tables).not.toContain(protectedTable);
    }
  });

  it("rejects an empty or non-array selection", () => {
    expect(() => resolvePurgeTables([])).toThrow(/al menos una/i);
    expect(() => resolvePurgeTables(undefined)).toThrow(/al menos una/i);
    expect(() => resolvePurgeTables("staff")).toThrow(/al menos una/i);
  });

  it("rejects unknown collections", () => {
    expect(() => resolvePurgeTables(["nope"])).toThrow(/no válida/i);
  });

  it("rejects attempts to purge protected tables by name", () => {
    expect(() => resolvePurgeTables(["users"])).toThrow(/no válida/i);
    expect(() => resolvePurgeTables(["schema_migrations"])).toThrow(/no válida/i);
  });
});

function makeFakePool(onQuery?: (sql: string) => void) {
  const calls: string[] = [];
  let committed = false;
  let rolledBack = false;
  const conn = {
    beginTransaction: async () => {},
    query: async (sql: string) => {
      calls.push(sql);
      onQuery?.(sql);
      return [{ affectedRows: 3 }, undefined] as [{ affectedRows: number }, undefined];
    },
    commit: async () => {
      committed = true;
    },
    rollback: async () => {
      rolledBack = true;
    },
    release: () => {},
  };
  return {
    pool: { getConnection: async () => conn },
    calls,
    state: () => ({ committed, rolledBack }),
  };
}

describe("executePurge", () => {
  it("deletes each table in order, commits, and reports affected rows", async () => {
    const fake = makeFakePool();
    const deleted = await executePurge(fake.pool, ["shifts", "events", "staff"]);

    expect(fake.calls).toEqual([
      "DELETE FROM shifts",
      "DELETE FROM events",
      "DELETE FROM staff",
    ]);
    expect(deleted).toEqual({ shifts: 3, events: 3, staff: 3 });
    expect(fake.state()).toEqual({ committed: true, rolledBack: false });
  });

  it("rolls back and rethrows when a delete fails", async () => {
    const fake = makeFakePool((sql) => {
      if (sql.includes("events")) throw new Error("boom");
    });
    await expect(executePurge(fake.pool, ["shifts", "events"])).rejects.toThrow("boom");
    expect(fake.state()).toEqual({ committed: false, rolledBack: true });
  });
});
