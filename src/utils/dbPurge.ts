// Client-side metadata + gating for the admin "Vaciar base de datos" tool.
// Collection keys MUST stay in sync with the server allowlist in
// server/mysql/purge.ts (COLLECTION_TABLES). A parity unit test guards this.

export const PURGE_CONFIRM_WORD = "VACIAR";

export interface PurgeCollectionOption {
  key: string;
  label: string;
  /** True when the live record count is available from health-count. */
  hasCount: boolean;
}

// Order shown in the dialog. `hasCount` marks collections whose count is
// reported by /api/mysql/health-count (staff/events/shifts/alerts); the join
// tables are not counted there, so they render without a number.
export const PURGE_COLLECTION_OPTIONS: PurgeCollectionOption[] = [
  { key: "staff", label: "Colaboradores", hasCount: true },
  { key: "events", label: "Eventos", hasCount: true },
  { key: "shifts", label: "Turnos", hasCount: true },
  { key: "alerts", label: "Alertas", hasCount: true },
  { key: "convocatorias", label: "Convocatorias", hasCount: false },
  { key: "plantillas", label: "Plantillas de equipo", hasCount: false },
];

export const PURGE_COLLECTION_KEYS = PURGE_COLLECTION_OPTIONS.map((option) => option.key);

// The wipe button is enabled only when at least one collection is selected AND
// the confirmation word is typed exactly (case-sensitive, trimmed).
export function canConfirmPurge(selected: readonly string[], confirmText: string): boolean {
  return selected.length > 0 && confirmText.trim() === PURGE_CONFIRM_WORD;
}
