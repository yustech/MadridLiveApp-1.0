import type { EventStaffMember, EventStaffRole } from '../../types';

const MYSQL_API_BASE = import.meta.env.VITE_MYSQL_API_BASE || '/api/mysql';

type ValidationError = { field?: string; message?: string };

export type BulkAssignmentResult = {
  added: string[];
  alreadyAssigned: string[];
  failed: Array<{ staffId: string; reason: string }>;
};

export class EventStaffApiError extends Error {
  readonly status: number;
  readonly errors: ValidationError[];

  constructor(message: string, status: number, errors: ValidationError[] = []) {
    super(message);
    this.name = 'EventStaffApiError';
    this.status = status;
    this.errors = errors;
  }
}

async function eventStaffJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MYSQL_API_BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => null) as {
      message?: string;
      errors?: ValidationError[];
    } | null;
    throw new EventStaffApiError(
      payload?.message || `Request failed: ${response.status}`,
      response.status,
      Array.isArray(payload?.errors) ? payload.errors : [],
    );
  }

  return response.json() as Promise<T>;
}

const eventStaffPath = (eventId: string) => `/events/${encodeURIComponent(eventId)}/staff`;

export function getEventStaff(eventId: string): Promise<EventStaffMember[]> {
  return eventStaffJson<EventStaffMember[]>(eventStaffPath(eventId));
}

export function addEventStaff(eventId: string, staffIds: string[]): Promise<BulkAssignmentResult> {
  return eventStaffJson<BulkAssignmentResult>(eventStaffPath(eventId), {
    method: 'POST',
    body: JSON.stringify({ staffIds }),
  });
}

export function updateEventStaffRole(
  eventId: string,
  staffId: string,
  assignedRole: EventStaffRole,
): Promise<{ success: boolean }> {
  return eventStaffJson<{ success: boolean }>(
    `${eventStaffPath(eventId)}/${encodeURIComponent(staffId)}`,
    { method: 'PATCH', body: JSON.stringify({ assignedRole }) },
  );
}

export function removeEventStaff(eventId: string, staffId: string): Promise<{ success: boolean }> {
  return eventStaffJson<{ success: boolean }>(
    `${eventStaffPath(eventId)}/${encodeURIComponent(staffId)}`,
    { method: 'DELETE' },
  );
}

export function formatEventStaffApiError(error: unknown): string {
  if (error instanceof EventStaffApiError && error.errors.length > 0) {
    return error.errors
      .map((item) => [item.field, item.message].filter(Boolean).join(': '))
      .join(' · ');
  }
  return error instanceof Error ? error.message : 'No se pudo completar la operación.';
}
