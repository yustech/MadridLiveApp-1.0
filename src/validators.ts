/**
 * Input Validation & Sanitization Module
 * 
 * Provides comprehensive sanitization and schema validation for all API endpoints.
 * All user-supplied data passes through these validators before database operations.
 */

export interface ValidationError {
  field: string;
  message: string;
  value?: unknown;
}

export interface ValidationResult<T> {
  valid: boolean;
  errors: ValidationError[];
  sanitized?: T;
}

type SanitizedPayload = Record<string, unknown>;

function validateStringField(
  value: unknown,
  fieldName: string,
  maxLength: number,
  options: { allowEmpty?: boolean } = {}
): ValidationResult<string> {
  if (options.allowEmpty && typeof value === "string" && value.trim().length === 0) {
    return { valid: true, errors: [], sanitized: "" };
  }

  return sanitizeString(value, fieldName, maxLength);
}

function validateNullableStringField(
  value: unknown,
  fieldName: string,
  maxLength: number
): ValidationResult<string | null> {
  if (value === null) {
    return { valid: true, errors: [], sanitized: null };
  }

  if (typeof value === "string" && value.trim().length === 0) {
    return { valid: true, errors: [], sanitized: null };
  }

  return sanitizeString(value, fieldName, maxLength);
}

function validateOptionalNumberField(
  value: unknown,
  fieldName: string,
  min?: number,
  max?: number,
  integerOnly = false
): ValidationResult<number> {
  const result = sanitizeNumber(value, fieldName, min, max);
  if (!result.valid || result.sanitized === undefined) {
    return result;
  }

  if (integerOnly && !Number.isInteger(result.sanitized)) {
    return {
      valid: false,
      errors: [{ field: fieldName, message: "Expected an integer", value }],
    };
  }

  return result;
}

/**
 * Sanitize generic string: trim, enforce max length, block control characters
 */
export function sanitizeString(
  value: unknown,
  fieldName: string,
  maxLength: number = 255
): ValidationResult<string> {
  const errors: ValidationError[] = [];

  if (typeof value !== "string") {
    errors.push({
      field: fieldName,
      message: `Expected string, got ${typeof value}`,
      value,
    });
    return { valid: false, errors };
  }

  let sanitized = value.trim();

  if (sanitized.length === 0) {
    errors.push({
      field: fieldName,
      message: "String cannot be empty after trimming",
      value,
    });
    return { valid: false, errors };
  }

  if (sanitized.length > maxLength) {
    errors.push({
      field: fieldName,
      message: `String exceeds max length of ${maxLength} characters`,
      value: sanitized.substring(0, 50) + "...",
    });
    return { valid: false, errors };
  }

  // Block control characters (except newline/tab for some fields)
  if (/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g.test(sanitized)) {
    errors.push({
      field: fieldName,
      message: "String contains invalid control characters",
      value,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors, sanitized };
}

/**
 * Sanitize ID code: alphanumeric, dashes, underscores only; max 96 chars
 */
export function sanitizeIdCode(value: unknown): ValidationResult<string> {
  const errors: ValidationError[] = [];

  if (typeof value !== "string") {
    errors.push({
      field: "idCode",
      message: `Expected string, got ${typeof value}`,
      value,
    });
    return { valid: false, errors };
  }

  let sanitized = value.trim();

  if (sanitized.length === 0) {
    errors.push({
      field: "idCode",
      message: "ID code cannot be empty",
      value,
    });
    return { valid: false, errors };
  }

  if (sanitized.length > 96) {
    errors.push({
      field: "idCode",
      message: "ID code exceeds max length of 96 characters",
      value,
    });
    return { valid: false, errors };
  }

  if (!/^[a-zA-Z0-9_-]+$/.test(sanitized)) {
    errors.push({
      field: "idCode",
      message: "ID code must contain only letters, numbers, dashes, and underscores",
      value,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors, sanitized };
}

/**
 * Sanitize name: letters, numbers, spaces, hyphens, apostrophes, accents; max 255
 */
export function sanitizeName(value: unknown): ValidationResult<string> {
  const errors: ValidationError[] = [];

  if (typeof value !== "string") {
    errors.push({
      field: "name",
      message: `Expected string, got ${typeof value}`,
      value,
    });
    return { valid: false, errors };
  }

  let sanitized = value.trim();

  if (sanitized.length === 0) {
    errors.push({
      field: "name",
      message: "Name cannot be empty",
      value,
    });
    return { valid: false, errors };
  }

  if (sanitized.length > 255) {
    errors.push({
      field: "name",
      message: "Name exceeds max length of 255 characters",
      value,
    });
    return { valid: false, errors };
  }

  // Allow letters (incl. accents), numbers, spaces, hyphens, apostrophes
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s\-'0-9]+$/.test(sanitized)) {
    errors.push({
      field: "name",
      message: "Name contains invalid characters",
      value,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors, sanitized };
}

/**
 * Sanitize role: lowercase alphanumeric and underscores only; max 64
 */
export function sanitizeRole(value: unknown): ValidationResult<string> {
  const errors: ValidationError[] = [];

  if (typeof value !== "string") {
    errors.push({
      field: "role",
      message: `Expected string, got ${typeof value}`,
      value,
    });
    return { valid: false, errors };
  }

  let sanitized = value.trim().toLowerCase();

  if (sanitized.length === 0) {
    errors.push({
      field: "role",
      message: "Role cannot be empty",
      value,
    });
    return { valid: false, errors };
  }

  if (sanitized.length > 64) {
    errors.push({
      field: "role",
      message: "Role exceeds max length of 64 characters",
      value,
    });
    return { valid: false, errors };
  }

  if (!/^[a-z0-9_]+$/.test(sanitized)) {
    errors.push({
      field: "role",
      message: "Role must contain only lowercase letters, numbers, and underscores",
      value,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors, sanitized };
}

/**
 * Sanitize status: must be one of allowed values
 */
export function sanitizeStatus(
  value: unknown,
  fieldName: string = "status",
  allowedValues: string[] = ["active", "inactive", "on_duty"]
): ValidationResult<string> {
  const errors: ValidationError[] = [];

  if (typeof value !== "string") {
    errors.push({
      field: fieldName,
      message: `Expected string, got ${typeof value}`,
      value,
    });
    return { valid: false, errors };
  }

  const sanitized = value.trim().toLowerCase();

  if (!allowedValues.includes(sanitized)) {
    errors.push({
      field: fieldName,
      message: `Status must be one of: ${allowedValues.join(", ")}`,
      value,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors, sanitized };
}

/**
 * Sanitize location: letters, numbers, spaces, hyphens, slashes; max 128
 */
export function sanitizeLocation(value: unknown): ValidationResult<string> {
  const errors: ValidationError[] = [];

  if (typeof value !== "string") {
    errors.push({
      field: "location",
      message: `Expected string, got ${typeof value}`,
      value,
    });
    return { valid: false, errors };
  }

  let sanitized = value.trim();

  if (sanitized.length === 0) {
    errors.push({
      field: "location",
      message: "Location cannot be empty",
      value,
    });
    return { valid: false, errors };
  }

  if (sanitized.length > 128) {
    errors.push({
      field: "location",
      message: "Location exceeds max length of 128 characters",
      value,
    });
    return { valid: false, errors };
  }

  if (!/^[a-zA-Z0-9\s\-\/()]+$/.test(sanitized)) {
    errors.push({
      field: "location",
      message: "Location contains invalid characters",
      value,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors, sanitized };
}

/**
 * Sanitize number: must be finite, optionally bounded
 */
export function sanitizeNumber(
  value: unknown,
  fieldName: string,
  min?: number,
  max?: number
): ValidationResult<number> {
  const errors: ValidationError[] = [];

  const num = Number(value);

  if (isNaN(num) || !isFinite(num)) {
    errors.push({
      field: fieldName,
      message: "Expected a valid number",
      value,
    });
    return { valid: false, errors };
  }

  if (min !== undefined && num < min) {
    errors.push({
      field: fieldName,
      message: `Number must be at least ${min}`,
      value: num,
    });
    return { valid: false, errors };
  }

  if (max !== undefined && num > max) {
    errors.push({
      field: fieldName,
      message: `Number must be at most ${max}`,
      value: num,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors, sanitized: num };
}

/**
 * Sanitize datetime: ISO 8601 format validation
 */
export function sanitizeDateTime(value: unknown, fieldName: string): ValidationResult<string> {
  const errors: ValidationError[] = [];

  if (typeof value !== "string") {
    errors.push({
      field: fieldName,
      message: `Expected ISO 8601 string, got ${typeof value}`,
      value,
    });
    return { valid: false, errors };
  }

  const sanitized = value.trim();

  // Validate ISO 8601 format and parsability
  const dateObj = new Date(sanitized);
  if (isNaN(dateObj.getTime())) {
    errors.push({
      field: fieldName,
      message: "Invalid datetime format (expected ISO 8601)",
      value: sanitized,
    });
    return { valid: false, errors };
  }

  return { valid: true, errors, sanitized };
}

/**
 * Validate staff creation payload
 */
export function validateStaffPayload(body: unknown): ValidationResult<any> {
  const errors: ValidationError[] = [];
  const sanitized: any = {};
  const allowedRoles = ["Auxiliar", "Auxiliar Plus", "Coordinación"];

  if (typeof body !== "object" || body === null) {
    return {
      valid: false,
      errors: [{ field: "payload", message: "Expected object payload" }],
    };
  }

  const b = body as any;

  // idCode (required)
  const idCodeRes = sanitizeIdCode(b.idCode);
  if (!idCodeRes.valid) {
    errors.push(...idCodeRes.errors);
  } else {
    sanitized.idCode = idCodeRes.sanitized;
  }

  // name (required)
  const nameRes = sanitizeName(b.name);
  if (!nameRes.valid) {
    errors.push(...nameRes.errors);
  } else {
    sanitized.name = nameRes.sanitized;
  }

  // role (required)
  if (typeof b.role !== "string" || !allowedRoles.includes(b.role.trim())) {
    errors.push({
      field: "role",
      message: "Role must be one of: Auxiliar, Auxiliar Plus, Coordinación",
      value: b.role,
    });
  } else {
    sanitized.role = b.role.trim();
  }

  // roleLabel (required, max 128)
  const roleLabelRes = sanitizeString(b.roleLabel, "roleLabel", 128);
  if (!roleLabelRes.valid) {
    errors.push(...roleLabelRes.errors);
  } else {
    sanitized.roleLabel = roleLabelRes.sanitized;
  }

  // status (required, enum)
  // Staff status can be IN/OUT (computed) or active/inactive (stored)
  let statusValue = String(b.status || '').trim();
  const validStaffStatuses = ["IN", "OUT", "active", "inactive"];
  // Normalize: make it case-insensitive check
  if (!validStaffStatuses.some(v => v.toLowerCase() === statusValue.toLowerCase())) {
    errors.push({
      field: "status",
      message: "Status must be one of: IN, OUT, active, inactive",
      value: b.status,
    });
  } else {
    // Store in the case provided, or normalize to lowercase
    sanitized.status = statusValue;
  }
  const statusRes = { valid: true, errors: [], sanitized: statusValue };
  if (!statusRes.valid) {
    errors.push(...statusRes.errors);
  } else {
    sanitized.status = statusRes.sanitized;
  }

  // avatar (optional, URL or compact data URL, max 65535, defaults to empty string)
  if (b.avatar !== undefined) {
    if (typeof b.avatar === "string") {
      const avatarTrimmed = b.avatar.trim();
      if (avatarTrimmed.length > 65535) {
        errors.push({
          field: "avatar",
          message: "Avatar data exceeds max length supported by storage",
        });
      } else {
        sanitized.avatar = avatarTrimmed || "";
      }
    } else if (b.avatar !== null) {
      errors.push({
        field: "avatar",
        message: `Expected string or null, got ${typeof b.avatar}`,
      });
    } else {
      sanitized.avatar = "";
    }
  } else {
    sanitized.avatar = "";
  }

  // location (optional for staff profile; shifts/events keep strict location)
  if (b.location !== undefined && b.location !== null && String(b.location).trim() !== '') {
    const locationRes = sanitizeLocation(b.location);
    if (!locationRes.valid) {
      errors.push(...locationRes.errors);
    } else {
      sanitized.location = locationRes.sanitized;
    }
  } else {
    sanitized.location = null;
  }

  if (b.email !== undefined && b.email !== null && String(b.email).trim() !== "") {
    const emailRes = sanitizeString(b.email, "email", 255);
    if (!emailRes.valid) {
      errors.push(...emailRes.errors);
    } else {
      sanitized.email = emailRes.sanitized;
    }
  } else {
    sanitized.email = null;
  }

  if (b.phone !== undefined && b.phone !== null && String(b.phone).trim() !== "") {
    const phoneRes = sanitizeString(b.phone, "phone", 32);
    if (!phoneRes.valid) {
      errors.push(...phoneRes.errors);
    } else {
      sanitized.phone = phoneRes.sanitized;
    }
  } else {
    sanitized.phone = null;
  }

  const totalHoursValue = Number(b.totalHours ?? 0);
  if (!Number.isFinite(totalHoursValue) || totalHoursValue < 0) {
    errors.push({ field: "totalHours", message: "totalHours must be a number >= 0", value: b.totalHours });
  } else {
    sanitized.totalHours = totalHoursValue;
  }

  const shiftHoursValue = Number(b.currentShiftHours ?? 0);
  if (!Number.isInteger(shiftHoursValue) || shiftHoursValue < 0) {
    errors.push({ field: "currentShiftHours", message: "currentShiftHours must be an integer >= 0", value: b.currentShiftHours });
  } else {
    sanitized.currentShiftHours = shiftHoursValue;
  }

  const shiftMinsValue = Number(b.currentShiftMins ?? 0);
  if (!Number.isInteger(shiftMinsValue) || shiftMinsValue < 0) {
    errors.push({ field: "currentShiftMins", message: "currentShiftMins must be an integer >= 0", value: b.currentShiftMins });
  } else {
    sanitized.currentShiftMins = shiftMinsValue;
  }

  // Force null for system-managed fields
  sanitized.checkedInTime = null;
  sanitized.lastSeen = null;

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Validate partial staff update payload.
 */
export function validateStaffPatchPayload(body: unknown): ValidationResult<SanitizedPayload> {
  const errors: ValidationError[] = [];
  const sanitized: SanitizedPayload = {};
  const allowedRoles = ["Auxiliar", "Auxiliar Plus", "Coordinación"];

  if (typeof body !== "object" || body === null) {
    return {
      valid: false,
      errors: [{ field: "payload", message: "Expected object payload" }],
    };
  }

  const b = body as Record<string, unknown>;

  if (b.idCode !== undefined) {
    const result = sanitizeIdCode(b.idCode);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.idCode = result.sanitized;
  }

  if (b.name !== undefined) {
    const result = sanitizeName(b.name);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.name = result.sanitized;
  }

  if (b.role !== undefined) {
    const role = typeof b.role === "string" ? b.role.trim() : "";
    if (!allowedRoles.includes(role)) {
      errors.push({
        field: "role",
        message: "Role must be one of: Auxiliar, Auxiliar Plus, Coordinación",
        value: b.role,
      });
    } else {
      sanitized.role = role;
    }
  }

  if (b.roleLabel !== undefined) {
    const result = validateStringField(b.roleLabel, "roleLabel", 128);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.roleLabel = result.sanitized;
  }

  if (b.status !== undefined) {
    const status = typeof b.status === "string" ? b.status.trim().toUpperCase() : "";
    if (!["IN", "OUT", "ACTIVE", "INACTIVE"].includes(status)) {
      errors.push({
        field: "status",
        message: "Status must be one of: IN, OUT, active, inactive",
        value: b.status,
      });
    } else {
      sanitized.status = status === "ACTIVE" || status === "INACTIVE" ? status.toLowerCase() : status;
    }
  }

  if (b.checkedInTime !== undefined) {
    const result = validateNullableStringField(b.checkedInTime, "checkedInTime", 32);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.checkedInTime = result.sanitized;
  }

  if (b.lastSeen !== undefined) {
    const result = validateNullableStringField(b.lastSeen, "lastSeen", 128);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.lastSeen = result.sanitized;
  }

  if (b.avatar !== undefined) {
    if (typeof b.avatar === "string") {
      const avatar = b.avatar.trim();
      if (avatar.length > 65535) {
        errors.push({ field: "avatar", message: "Avatar data exceeds max length supported by storage" });
      } else {
        sanitized.avatar = avatar;
      }
    } else if (b.avatar === null) {
      sanitized.avatar = "";
    } else {
      errors.push({ field: "avatar", message: `Expected string or null, got ${typeof b.avatar}` });
    }
  }

  if (b.email !== undefined) {
    const result = validateNullableStringField(b.email, "email", 255);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.email = result.sanitized;
  }

  if (b.phone !== undefined) {
    const result = validateNullableStringField(b.phone, "phone", 32);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.phone = result.sanitized;
  }

  if (b.totalHours !== undefined) {
    const result = validateOptionalNumberField(b.totalHours, "totalHours", 0);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.totalHours = result.sanitized;
  }

  if (b.currentShiftHours !== undefined) {
    const result = validateOptionalNumberField(b.currentShiftHours, "currentShiftHours", 0, undefined, true);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.currentShiftHours = result.sanitized;
  }

  if (b.currentShiftMins !== undefined) {
    const result = validateOptionalNumberField(b.currentShiftMins, "currentShiftMins", 0, undefined, true);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.currentShiftMins = result.sanitized;
  }

  if (b.location !== undefined) {
    if (b.location === null || (typeof b.location === "string" && b.location.trim() === "")) {
      sanitized.location = null;
    } else {
      const result = sanitizeLocation(b.location);
      if (!result.valid) errors.push(...result.errors);
      else sanitized.location = result.sanitized;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Validate shift creation payload
 */
export function validateShiftPayload(body: unknown): ValidationResult<any> {
  const errors: ValidationError[] = [];
  const sanitized: any = {};

  if (typeof body !== "object" || body === null) {
    return {
      valid: false,
      errors: [{ field: "payload", message: "Expected object payload" }],
    };
  }

  const b = body as any;

  // workerId (required, should exist in staff table, can be number or "usr_XXX" format)
  let workerId: string | number | null = null;
  const workerIdVal = String(b.workerId || '').trim();
  
  if (workerIdVal.startsWith('usr_')) {
    // Keep the full "usr_102" format
    workerId = workerIdVal;
  } else if (workerIdVal.match(/^\d+$/)) {
    // Pure numeric ID - convert to number and ensure >= 1
    const asNum = Number(workerIdVal);
    if (asNum >= 1) {
      workerId = asNum;
    }
  }
  
  if (workerId === null) {
    errors.push({
      field: "workerId",
      message: "Expected a number >= 1 or string like 'usr_102'",
      value: b.workerId,
    });
  } else {
    sanitized.workerId = workerId;
  }

  // dateString (required, accepts ISO or legacy human labels)
  if (typeof b.dateString !== "string" || !b.dateString.trim()) {
    errors.push({
      field: "dateString",
      message: "dateString is required",
      value: b.dateString,
    });
  } else {
    sanitized.dateString = b.dateString.trim();
  }

  // timespan (required, enum-like)
  if (typeof b.timespan !== "string" || !b.timespan.trim()) {
    errors.push({
      field: "timespan",
      message: "Timespan is required",
      value: b.timespan,
    });
  } else {
    sanitized.timespan = b.timespan.trim();
  }

  // durationLabel (required, max 128)
  const durationRes = sanitizeString(b.durationLabel, "durationLabel", 128);
  if (!durationRes.valid) {
    errors.push(...durationRes.errors);
  } else {
    sanitized.durationLabel = durationRes.sanitized;
  }

  // legacy location (forbidden in shifts payload)
  if (b.location !== undefined) {
    errors.push({
      field: "location",
      message: "Legacy field location is not allowed for shifts. Use eventId/eventTitle.",
      value: b.location,
    });
  }

  // eventTitle (optional, defaults to title)
  if (b.eventTitle !== undefined && b.eventTitle !== null && String(b.eventTitle).trim() !== "") {
    const eventTitleRes = sanitizeString(b.eventTitle, "eventTitle", 255);
    if (!eventTitleRes.valid) {
      errors.push(...eventTitleRes.errors);
    } else {
      sanitized.eventTitle = eventTitleRes.sanitized;
    }
  } else {
    sanitized.eventTitle = sanitized.title;
  }

  // eventId (optional)
  if (b.eventId !== undefined && b.eventId !== null) {
    if (typeof b.eventId !== "string" || !b.eventId.trim()) {
      errors.push({
        field: "eventId",
        message: "Expected a non-empty string",
        value: b.eventId,
      });
    } else {
      sanitized.eventId = b.eventId.trim();
    }
  }

  // status (required, case-insensitive)
  const statusRes = sanitizeStatus(b.status, "status", ["active", "completed", "cancelled"]);
  if (!statusRes.valid) {
    errors.push(...statusRes.errors);
  } else {
    sanitized.status = statusRes.sanitized.charAt(0).toUpperCase() + statusRes.sanitized.slice(1);
  }

  // startedAt (required, ISO datetime)
  const startedRes = sanitizeDateTime(b.startedAt, "startedAt");
  if (!startedRes.valid) {
    errors.push(...startedRes.errors);
  } else {
    sanitized.startedAt = startedRes.sanitized;
  }

  // endedAt (optional, ISO datetime; can be null for ongoing shifts)
  if (b.endedAt !== undefined && b.endedAt !== null) {
    const endedRes = sanitizeDateTime(b.endedAt, "endedAt");
    if (!endedRes.valid) {
      errors.push(...endedRes.errors);
    } else {
      sanitized.endedAt = endedRes.sanitized;
    }
  } else {
    sanitized.endedAt = null;
  }

  // Cross-field validation: if endedAt is provided, it must be > startedAt
  if (sanitized.startedAt && sanitized.endedAt) {
    const startTime = new Date(sanitized.startedAt).getTime();
    const endTime = new Date(sanitized.endedAt).getTime();

    if (endTime <= startTime) {
      errors.push({
        field: "endedAt",
        message: "End time must be after start time",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Validate partial shift update payload.
 */
export function validateShiftPatchPayload(body: unknown): ValidationResult<SanitizedPayload> {
  const errors: ValidationError[] = [];
  const sanitized: SanitizedPayload = {};

  if (typeof body !== "object" || body === null) {
    return {
      valid: false,
      errors: [{ field: "payload", message: "Expected object payload" }],
    };
  }

  const b = body as Record<string, unknown>;

  if (b.location !== undefined) {
    errors.push({
      field: "location",
      message: "Legacy field location is not allowed for shifts. Use eventId/eventTitle.",
      value: b.location,
    });
  }

  if (b.workerId !== undefined) {
    const workerIdVal = String(b.workerId || "").trim();
    if (workerIdVal.startsWith("usr_")) {
      sanitized.workerId = workerIdVal;
    } else if (/^\d+$/.test(workerIdVal) && Number(workerIdVal) >= 1) {
      sanitized.workerId = Number(workerIdVal);
    } else {
      errors.push({
        field: "workerId",
        message: "Expected a number >= 1 or string like 'usr_102'",
        value: b.workerId,
      });
    }
  }

  if (b.dateString !== undefined) {
    const result = validateStringField(b.dateString, "dateString", 64);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.dateString = result.sanitized;
  }

  if (b.timespan !== undefined) {
    const result = validateStringField(b.timespan, "timespan", 128);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.timespan = result.sanitized;
  }

  if (b.durationLabel !== undefined) {
    const result = validateStringField(b.durationLabel, "durationLabel", 128);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.durationLabel = result.sanitized;
  }

  if (b.eventTitle !== undefined) {
    const result = validateStringField(b.eventTitle, "eventTitle", 255);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.eventTitle = result.sanitized;
  }

  if (b.eventId !== undefined) {
    if (b.eventId === null || (typeof b.eventId === "string" && b.eventId.trim() === "")) {
      sanitized.eventId = null;
    } else if (typeof b.eventId === "string") {
      sanitized.eventId = b.eventId.trim();
    } else {
      errors.push({ field: "eventId", message: "Expected a non-empty string or null", value: b.eventId });
    }
  }

  if (b.status !== undefined) {
    const statusRes = sanitizeStatus(b.status, "status", ["active", "completed", "cancelled"]);
    if (!statusRes.valid) {
      errors.push(...statusRes.errors);
    } else {
      sanitized.status = statusRes.sanitized.charAt(0).toUpperCase() + statusRes.sanitized.slice(1);
    }
  }

  if (b.startedAt !== undefined) {
    if (b.startedAt === null || b.startedAt === "") {
      sanitized.startedAt = null;
    } else {
      const result = sanitizeDateTime(b.startedAt, "startedAt");
      if (!result.valid) errors.push(...result.errors);
      else sanitized.startedAt = result.sanitized;
    }
  }

  if (b.endedAt !== undefined) {
    if (b.endedAt === null || b.endedAt === "") {
      sanitized.endedAt = null;
    } else {
      const result = sanitizeDateTime(b.endedAt, "endedAt");
      if (!result.valid) errors.push(...result.errors);
      else sanitized.endedAt = result.sanitized;
    }
  }

  const startedAt = sanitized.startedAt ?? b.startedAt;
  const endedAt = sanitized.endedAt ?? b.endedAt;
  if (startedAt && endedAt) {
    const startTime = new Date(String(startedAt)).getTime();
    const endTime = new Date(String(endedAt)).getTime();
    if (Number.isFinite(startTime) && Number.isFinite(endTime) && endTime <= startTime) {
      errors.push({
        field: "endedAt",
        message: "End time must be after start time",
      });
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Validate event creation payload
 */
export function validateEventPayload(body: unknown): ValidationResult<any> {
  const errors: ValidationError[] = [];
  const sanitized: any = {};

  if (typeof body !== "object" || body === null) {
    return {
      valid: false,
      errors: [{ field: "payload", message: "Expected object payload" }],
    };
  }

  const b = body as any;

  // title (required, max 256)
  const titleRes = sanitizeString(b.title, "title", 256);
  if (!titleRes.valid) {
    errors.push(...titleRes.errors);
  } else {
    sanitized.title = titleRes.sanitized;
  }

  // eventTitle (optional, defaults to title)
  if (b.eventTitle !== undefined && b.eventTitle !== null && String(b.eventTitle).trim() !== "") {
    const eventTitleRes = sanitizeString(b.eventTitle, "eventTitle", 255);
    if (!eventTitleRes.valid) {
      errors.push(...eventTitleRes.errors);
    } else {
      sanitized.eventTitle = eventTitleRes.sanitized;
    }
  } else {
    sanitized.eventTitle = sanitized.title;
  }

  // eventId (optional)
  if (b.eventId !== undefined && b.eventId !== null) {
    if (typeof b.eventId !== "string" || !b.eventId.trim()) {
      errors.push({
        field: "eventId",
        message: "Expected a non-empty string",
        value: b.eventId,
      });
    } else {
      sanitized.eventId = b.eventId.trim();
    }
  }

  // dateDay (required, 1-31)
  const dayRes = sanitizeNumber(b.dateDay, "dateDay", 1, 31);
  if (!dayRes.valid) {
    errors.push(...dayRes.errors);
  } else {
    sanitized.dateDay = dayRes.sanitized;
  }

  // dateMonth (required, accepts numeric or month tokens like JAN/OCT/ABR)
  if (b.dateMonth === undefined || b.dateMonth === null || String(b.dateMonth).trim() === "") {
    errors.push({ field: "dateMonth", message: "dateMonth is required", value: b.dateMonth });
  } else {
    const rawMonth = String(b.dateMonth).trim().toUpperCase();
    const monthMap = { 'JAN': 'JAN', 'FEB': 'FEB', 'MAR': 'MAR', 'APR': 'APR', 'MAY': 'MAY', 'JUN': 'JUN', 'JUL': 'JUL', 'AUG': 'AUG', 'SEP': 'SEP', 'OCT': 'OCT', 'NOV': 'NOV', 'DEC': 'DEC', 'ENE': 'ENE', 'ABR': 'ABR', 'AGO': 'AGO', 'DIC': 'DIC' };
    if (rawMonth in monthMap) {
      sanitized.dateMonth = monthMap[rawMonth];
    } else {
      const monthRes = sanitizeNumber(b.dateMonth, "dateMonth", 1, 12);
      if (!monthRes.valid) {
        errors.push(...monthRes.errors);
      } else {
        sanitized.dateMonth = String(monthRes.sanitized);
      }
    }
  }

  // doorsOpen (required, max 64, time format)
  const doorsRes = sanitizeString(b.doorsOpen, "doorsOpen", 64);
  if (!doorsRes.valid) {
    errors.push(...doorsRes.errors);
  } else {
    sanitized.doorsOpen = doorsRes.sanitized;
  }

  // requiredStaff (optional, 0+)
  if (b.requiredStaff !== undefined) {
    const reqRes = sanitizeNumber(b.requiredStaff, "requiredStaff", 0);
    if (!reqRes.valid) {
      errors.push(...reqRes.errors);
    } else {
      sanitized.requiredStaff = reqRes.sanitized;
    }
  }

  // activeStaff (optional, 0+)
  if (b.activeStaff !== undefined) {
    const activeRes = sanitizeNumber(b.activeStaff, "activeStaff", 0);
    if (!activeRes.valid) {
      errors.push(...activeRes.errors);
    } else {
      sanitized.activeStaff = activeRes.sanitized;
    }
  }

  // totalStaffNeeded (optional, 0+)
  if (b.totalStaffNeeded !== undefined) {
    const totalRes = sanitizeNumber(b.totalStaffNeeded, "totalStaffNeeded", 0);
    if (!totalRes.valid) {
      errors.push(...totalRes.errors);
    } else {
      sanitized.totalStaffNeeded = totalRes.sanitized;
    }
  }

  // scanRate (optional, 0-100)
  if (b.scanRate !== undefined) {
    const scanRes = sanitizeNumber(b.scanRate, "scanRate", 0, 100);
    if (!scanRes.valid) {
      errors.push(...scanRes.errors);
    } else {
      sanitized.scanRate = scanRes.sanitized;
    }
  }

  // loadInPercent (optional, 0-100)
  if (b.loadInPercent !== undefined) {
    const loadRes = sanitizeNumber(b.loadInPercent, "loadInPercent", 0, 100);
    if (!loadRes.valid) {
      errors.push(...loadRes.errors);
    } else {
      sanitized.loadInPercent = loadRes.sanitized;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Validate partial event update payload.
 */
export function validateEventPatchPayload(body: unknown): ValidationResult<SanitizedPayload> {
  const errors: ValidationError[] = [];
  const sanitized: SanitizedPayload = {};

  if (typeof body !== "object" || body === null) {
    return {
      valid: false,
      errors: [{ field: "payload", message: "Expected object payload" }],
    };
  }

  const b = body as Record<string, unknown>;

  if (b.title !== undefined) {
    const result = validateStringField(b.title, "title", 256);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.title = result.sanitized;
  }

  if (b.location !== undefined) {
    const result = validateStringField(b.location, "location", 255, { allowEmpty: true });
    if (!result.valid) errors.push(...result.errors);
    else sanitized.location = result.sanitized;
  }

  if (b.dateDay !== undefined) {
    const result = sanitizeNumber(b.dateDay, "dateDay", 1, 31);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.dateDay = String(result.sanitized);
  }

  if (b.dateMonth !== undefined) {
    if (b.dateMonth === null || String(b.dateMonth).trim() === "") {
      errors.push({ field: "dateMonth", message: "dateMonth is required", value: b.dateMonth });
    } else {
      const rawMonth = String(b.dateMonth).trim().toUpperCase();
      const monthMap = { JAN: "JAN", FEB: "FEB", MAR: "MAR", APR: "APR", MAY: "MAY", JUN: "JUN", JUL: "JUL", AUG: "AUG", SEP: "SEP", OCT: "OCT", NOV: "NOV", DEC: "DEC", ENE: "ENE", ABR: "ABR", AGO: "AGO", DIC: "DIC" };
      if (rawMonth in monthMap) {
        sanitized.dateMonth = monthMap[rawMonth as keyof typeof monthMap];
      } else {
        const result = sanitizeNumber(b.dateMonth, "dateMonth", 1, 12);
        if (!result.valid) errors.push(...result.errors);
        else sanitized.dateMonth = String(result.sanitized);
      }
    }
  }

  if (b.doorsOpen !== undefined) {
    const result = validateStringField(b.doorsOpen, "doorsOpen", 64);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.doorsOpen = result.sanitized;
  }

  if (b.requiredStaff !== undefined) {
    const result = sanitizeNumber(b.requiredStaff, "requiredStaff", 0);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.requiredStaff = result.sanitized;
  }

  if (b.activeStaff !== undefined) {
    const result = sanitizeNumber(b.activeStaff, "activeStaff", 0);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.activeStaff = result.sanitized;
  }

  if (b.totalStaffNeeded !== undefined) {
    const result = sanitizeNumber(b.totalStaffNeeded, "totalStaffNeeded", 0);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.totalStaffNeeded = result.sanitized;
  }

  if (b.scanRate !== undefined) {
    const result = sanitizeNumber(b.scanRate, "scanRate", 0, 100);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.scanRate = result.sanitized;
  }

  if (b.loadInPercent !== undefined) {
    const result = sanitizeNumber(b.loadInPercent, "loadInPercent", 0, 100);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.loadInPercent = result.sanitized;
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Validate alert creation payload.
 */
export function validateAlertPayload(body: unknown): ValidationResult<SanitizedPayload> {
  const errors: ValidationError[] = [];
  const sanitized: SanitizedPayload = {};

  if (typeof body !== "object" || body === null) {
    return {
      valid: false,
      errors: [{ field: "payload", message: "Expected object payload" }],
    };
  }

  const b = body as Record<string, unknown>;

  const messageRes = validateStringField(b.message, "message", 2000);
  if (!messageRes.valid) errors.push(...messageRes.errors);
  else sanitized.message = messageRes.sanitized;

  const zoneRes = validateStringField(b.zone, "zone", 128);
  if (!zoneRes.valid) errors.push(...zoneRes.errors);
  else sanitized.zone = zoneRes.sanitized;

  const timestampRes = validateStringField(b.timestamp, "timestamp", 64);
  if (!timestampRes.valid) errors.push(...timestampRes.errors);
  else sanitized.timestamp = timestampRes.sanitized;

  const severityRes = sanitizeStatus(b.severity, "severity", ["warning", "error", "info"]);
  if (!severityRes.valid) errors.push(...severityRes.errors);
  else sanitized.severity = severityRes.sanitized;

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

/**
 * Validate partial alert update payload.
 */
export function validateAlertPatchPayload(body: unknown): ValidationResult<SanitizedPayload> {
  const errors: ValidationError[] = [];
  const sanitized: SanitizedPayload = {};

  if (typeof body !== "object" || body === null) {
    return {
      valid: false,
      errors: [{ field: "payload", message: "Expected object payload" }],
    };
  }

  const b = body as Record<string, unknown>;

  if (b.message !== undefined) {
    const result = validateStringField(b.message, "message", 2000);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.message = result.sanitized;
  }

  if (b.zone !== undefined) {
    const result = validateStringField(b.zone, "zone", 128);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.zone = result.sanitized;
  }

  if (b.timestamp !== undefined) {
    const result = validateStringField(b.timestamp, "timestamp", 64);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.timestamp = result.sanitized;
  }

  if (b.severity !== undefined) {
    const result = sanitizeStatus(b.severity, "severity", ["warning", "error", "info"]);
    if (!result.valid) errors.push(...result.errors);
    else sanitized.severity = result.sanitized;
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}
