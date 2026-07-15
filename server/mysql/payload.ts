import { sanitizeLocation } from "../../src/validators";
import { makeRouteError } from "./routeErrors";

export function getOptionalPayloadString(
  body: Record<string, unknown>,
  fieldName: string,
  maxLength: number
) {
  const rawValue = body[fieldName];
  if (rawValue === undefined || rawValue === null) return "";
  if (typeof rawValue !== "string") {
    throw makeRouteError(400, `${fieldName} must be a string.`);
  }

  const value = rawValue.trim();
  if (value.length > maxLength) {
    throw makeRouteError(400, `${fieldName} exceeds max length of ${maxLength}.`);
  }
  return value;
}

export function getRequiredPayloadString(
  body: Record<string, unknown>,
  fieldName: string,
  maxLength: number
) {
  const value = getOptionalPayloadString(body, fieldName, maxLength);
  if (!value) {
    throw makeRouteError(400, `${fieldName} is required.`);
  }
  return value;
}

export function normalizeCheckInLocation(value: unknown) {
  if (value === undefined || value === null || String(value).trim() === "") {
    return null;
  }

  const validation = sanitizeLocation(value);
  if (!validation.valid) {
    throw makeRouteError(
      400,
      validation.errors.map((error) => `${error.field}: ${error.message}`).join("; ")
    );
  }
  return validation.sanitized || null;
}
