import type { StaffMember } from '../../types';

const MYSQL_API_BASE = import.meta.env.VITE_MYSQL_API_BASE || '/api/mysql';

export type StaffPatch = Partial<Pick<StaffMember, 'idCode' | 'name' | 'role' | 'roleLabel' | 'email' | 'phone'>>;

type ValidationError = {
  field?: string;
  message?: string;
};

export class RosterApiError extends Error {
  readonly errors: ValidationError[];

  constructor(message: string, errors: ValidationError[] = []) {
    super(message);
    this.name = 'RosterApiError';
    this.errors = errors;
  }
}

async function rosterJson<T>(path: string, init?: RequestInit): Promise<T> {
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
    throw new RosterApiError(
      payload?.message || `Request failed: ${response.status}`,
      Array.isArray(payload?.errors) ? payload.errors : [],
    );
  }

  return response.json() as Promise<T>;
}

export function getRosterStaff(): Promise<StaffMember[]> {
  return rosterJson<StaffMember[]>('/staff');
}

export function patchRosterStaff(workerId: string, patch: StaffPatch): Promise<{ success: boolean }> {
  return rosterJson<{ success: boolean }>(`/staff/${encodeURIComponent(workerId)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export function formatRosterApiError(error: unknown): string {
  if (error instanceof RosterApiError && error.errors.length > 0) {
    return error.errors
      .map((item) => [item.field, item.message].filter(Boolean).join(': '))
      .join(' · ');
  }
  return error instanceof Error ? error.message : 'No se pudo guardar el cambio.';
}
