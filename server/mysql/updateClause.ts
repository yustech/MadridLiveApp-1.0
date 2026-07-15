export function buildUpdateClause(payload: Record<string, unknown>, allowedFields: string[]) {
  const fields = Object.keys(payload).filter((key) => allowedFields.includes(key));
  if (fields.length === 0) {
    return { clause: "", values: [] as unknown[] };
  }

  const clause = fields.map((field) => `${field} = ?`).join(", ");
  const values = fields.map((field) => payload[field]);
  return { clause, values };
}
