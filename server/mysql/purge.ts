// Selective database purge for the admin "Vaciar base de datos" maintenance tool.
//
// Safety model:
// - `users` and `schema_migrations` are NEVER purgeable (auth + schema state must
//   survive a wipe, or the admin locks themselves out / the migration ledger breaks).
// - Table names only ever come from the fixed allowlist below, never from the
//   request body, so the interpolated DELETE statements carry no injection risk.

// Tables that must never be emptied by this tool, whatever the request says.
export const PURGE_PROTECTED_TABLES = ["users", "schema_migrations"] as const;

// User-facing collection key -> underlying business table(s). Child tables are
// listed before their parents so a partial selection stays tidy.
const COLLECTION_TABLES: Record<string, string[]> = {
  staff: ["staff"],
  events: ["events"],
  shifts: ["shifts"],
  alerts: ["alerts"],
  convocatorias: ["event_staff"],
  plantillas: ["staff_template_members", "staff_templates"],
};

export const PURGE_COLLECTION_KEYS = Object.keys(COLLECTION_TABLES);

// Global child-before-parent delete order across every business table. The
// schema has no foreign keys (relations are logical VARCHAR columns), so this
// order is for tidiness/consistency rather than to satisfy FK constraints.
const GLOBAL_DELETE_ORDER = [
  "shifts",
  "alerts",
  "event_staff",
  "staff_template_members",
  "staff_templates",
  "events",
  "staff",
];

// Pure: validate the requested collections and resolve them to an ordered,
// deduplicated list of tables. Throws on an empty/invalid selection or if a
// protected table is ever reached (defense in depth — it cannot be via the
// allowlist, but we assert it anyway).
export function resolvePurgeTables(collections: unknown): string[] {
  if (!Array.isArray(collections) || collections.length === 0) {
    throw new Error("Debes indicar al menos una colección para vaciar.");
  }

  const tables = new Set<string>();
  for (const raw of collections) {
    const key = typeof raw === "string" ? raw.trim() : "";
    const mapped = COLLECTION_TABLES[key];
    if (!mapped) {
      throw new Error(`Colección no válida: ${String(raw)}`);
    }
    for (const table of mapped) tables.add(table);
  }

  for (const protectedTable of PURGE_PROTECTED_TABLES) {
    if (tables.has(protectedTable)) {
      throw new Error(`Tabla protegida, no se puede vaciar: ${protectedTable}`);
    }
  }

  return GLOBAL_DELETE_ORDER.filter((table) => tables.has(table));
}

interface PurgePool {
  getConnection: () => Promise<{
    beginTransaction: () => Promise<unknown>;
    query: (sql: string) => Promise<unknown>;
    commit: () => Promise<unknown>;
    rollback: () => Promise<unknown>;
    release: () => void;
  }>;
}

// Execute the DELETEs for an already-resolved, allowlisted table list inside a
// single transaction. Returns rows removed per table.
export async function executePurge(pool: PurgePool, tables: string[]): Promise<Record<string, number>> {
  const conn = await pool.getConnection();
  const deleted: Record<string, number> = {};
  try {
    await conn.beginTransaction();
    for (const table of tables) {
      const result = (await conn.query(`DELETE FROM ${table}`)) as [{ affectedRows?: number }, unknown];
      deleted[table] = Number(result?.[0]?.affectedRows ?? 0);
    }
    await conn.commit();
  } catch (error) {
    try {
      await conn.rollback();
    } catch {
      // Keep the original purge failure.
    }
    throw error;
  } finally {
    conn.release();
  }
  return deleted;
}
