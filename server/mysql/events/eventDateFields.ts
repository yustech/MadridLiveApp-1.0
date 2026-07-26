import { parseEventMonth } from "../../../src/utils/events";
import { getMadridCivilDateParts } from "../../../src/utils/madridTime";

export const LOCKED_EVENT_DATE_FIELDS = ["dateDay", "dateMonth", "dateYear", "doorsOpen"] as const;

export type LockedEventDateField = (typeof LOCKED_EVENT_DATE_FIELDS)[number];

/**
 * Compara un campo de fecha/hora entrante con el almacenado.
 *
 * No vale comparar cadenas: `validateEventPatchPayload` normaliza el día a
 * número sin ceros a la izquierda ('08' -> '8'), mientras que la semilla los
 * inserta en crudo desde `src/data.ts` ('08'). El año replica el COALESCE que
 * ya hace `GET /events` cuando la columna es NULL, y el mes se compara por
 * índice para que 'JAN' y 'ENE' cuenten como el mismo mes.
 */
export function isSameEventDateField(
  field: LockedEventDateField,
  incoming: unknown,
  current: unknown,
): boolean {
  const asTrimmedString = (value: unknown) => String(value ?? "").trim();

  if (field === "dateDay") {
    const incomingDay = Number(incoming);
    const currentDay = Number(current);
    if (Number.isFinite(incomingDay) && Number.isFinite(currentDay)) {
      return incomingDay === currentDay;
    }
    return asTrimmedString(incoming) === asTrimmedString(current);
  }

  if (field === "dateYear") {
    const incomingYear = Number(incoming);
    const currentYear = asTrimmedString(current) === ""
      ? getMadridCivilDateParts().year
      : Number(current);
    if (Number.isFinite(incomingYear) && Number.isFinite(currentYear)) {
      return incomingYear === currentYear;
    }
    return asTrimmedString(incoming) === asTrimmedString(current);
  }

  if (field === "dateMonth") {
    const incomingMonth = parseEventMonth(asTrimmedString(incoming));
    const currentMonth = parseEventMonth(asTrimmedString(current));
    if (incomingMonth !== null && currentMonth !== null) {
      return incomingMonth === currentMonth;
    }
    return asTrimmedString(incoming).toUpperCase() === asTrimmedString(current).toUpperCase();
  }

  return asTrimmedString(incoming) === asTrimmedString(current);
}

/**
 * True solo si el payload cambia de verdad alguno de los campos bloqueables.
 * Reenviar el mismo valor (lo que hace el EXPLORADOR BD, que manda el objeto
 * completo en cada PATCH) tiene que ser un no-op.
 */
export function changesLockedEventDateField(
  sanitized: Record<string, unknown>,
  current: Record<string, unknown>,
): boolean {
  return LOCKED_EVENT_DATE_FIELDS.some((field) => (
    sanitized[field] !== undefined && !isSameEventDateField(field, sanitized[field], current[field])
  ));
}
