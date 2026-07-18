import type { EventStaffRole, StaffTemplate } from '../../types';
import type { BulkAssignmentResult } from './eventStaffApi';

const MYSQL_API_BASE = import.meta.env.VITE_MYSQL_API_BASE || '/api/mysql';
const TEMPLATES_PATH = '/staff-templates';

type ValidationError = { field?: string; message?: string };

export class StaffTemplatesApiError extends Error {
  readonly status: number;
  readonly errors: ValidationError[];

  constructor(message: string, status: number, errors: ValidationError[] = []) {
    super(message);
    this.name = 'StaffTemplatesApiError';
    this.status = status;
    this.errors = errors;
  }
}

async function staffTemplatesJson<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new StaffTemplatesApiError(
      payload?.message || `Request failed: ${response.status}`,
      response.status,
      Array.isArray(payload?.errors) ? payload.errors : [],
    );
  }

  return response.json() as Promise<T>;
}

export function getStaffTemplates(): Promise<StaffTemplate[]> {
  return staffTemplatesJson<StaffTemplate[]>(TEMPLATES_PATH);
}

export function createStaffTemplateFromEvent(name: string, eventId: string): Promise<StaffTemplate> {
  return staffTemplatesJson<StaffTemplate>(TEMPLATES_PATH, {
    method: 'POST',
    body: JSON.stringify({ name, eventId }),
  });
}

export function updateStaffTemplateMemberRole(
  templateId: string,
  workerId: string,
  assignedRole: EventStaffRole,
): Promise<{ success: boolean }> {
  return staffTemplatesJson<{ success: boolean }>(
    `${TEMPLATES_PATH}/${encodeURIComponent(templateId)}/members/${encodeURIComponent(workerId)}`,
    { method: 'PATCH', body: JSON.stringify({ assignedRole }) },
  );
}

export function applyStaffTemplate(templateId: string, eventId: string): Promise<BulkAssignmentResult> {
  return staffTemplatesJson<BulkAssignmentResult>(
    `${TEMPLATES_PATH}/${encodeURIComponent(templateId)}/apply`,
    { method: 'POST', body: JSON.stringify({ eventId }) },
  );
}

export function deleteStaffTemplate(templateId: string): Promise<{ success: boolean }> {
  return staffTemplatesJson<{ success: boolean }>(
    `${TEMPLATES_PATH}/${encodeURIComponent(templateId)}`,
    { method: 'DELETE' },
  );
}

export function formatStaffTemplatesApiError(error: unknown): string {
  if (error instanceof StaffTemplatesApiError && error.errors.length > 0) {
    return error.errors
      .map((item) => [item.field, item.message].filter(Boolean).join(': '))
      .join(' · ');
  }
  return error instanceof Error ? error.message : 'No se pudo completar la operación con la plantilla.';
}
