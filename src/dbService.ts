import { LiveEvent, StaffMember, Shift, EquipmentAlert } from './types';
import { createSharedPoller } from './utils/sharedPoller';
import type { SharedPoller } from './utils/sharedPoller';

const MYSQL_API_BASE = import.meta.env.VITE_MYSQL_API_BASE || '/api/mysql';
const POLL_MS = 3000;

export interface ShiftToggleResult {
  success: boolean;
  action: 'checkin' | 'checkout';
  staff: StaffMember;
  shift: Shift;
}

export class MysqlApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'MysqlApiError';
    this.status = status;
    this.code = code;
  }
}

function normalizeStaff(worker: StaffMember): StaffMember {
  return {
    ...worker,
    location: worker.location?.trim() || '',
  };
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MYSQL_API_BASE}${path}`, {
    ...init,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    let payload: { message?: string; code?: string } | null = null;
    try {
      payload = text ? JSON.parse(text) as { message?: string; code?: string } : null;
    } catch {
      // Keep non-JSON API errors readable without losing the HTTP status.
    }
    throw new MysqlApiError(
      payload?.message || text || `Request failed: ${response.status}`,
      response.status,
      payload?.code,
    );
  }

  return response.json() as Promise<T>;
}

type PollingResourceOptions<T> = {
  sortFn?: (a: T, b: T) => number;
  mapItems?: (items: T[]) => T[];
};

const pollingResources = new Map<string, SharedPoller<unknown>>();

function getPollingResource<T>(path: string, options: PollingResourceOptions<T> = {}) {
  const existing = pollingResources.get(path);
  if (existing) return existing as SharedPoller<T>;

  const poller = createSharedPoller<T>({
    intervalMs: POLL_MS,
    fetchItems: async () => {
      const rawItems = await apiJson<T[]>(path);
      const items = options.mapItems ? options.mapItems(rawItems) : [...rawItems];
      if (options.sortFn) items.sort(options.sortFn);
      return items;
    },
    onError: (error) => {
      console.error(`MySQL polling error on ${path}:`, error);
    },
  });

  pollingResources.set(path, poller as SharedPoller<unknown>);
  return poller;
}

function createPollingSubscription<T>(
  path: string,
  callback: (items: T[]) => void,
  options: PollingResourceOptions<T> = {}
) {
  return getPollingResource<T>(path, options).subscribe(callback);
}

async function resetWithApi() {
  await apiJson('/reset-initial', { method: 'POST' });
}

// --- REAL-TIME-LIKE LISTENERS (polling) ---

export function subscribeToEvents(callback: (events: LiveEvent[]) => void) {
  return createPollingSubscription<LiveEvent>('/events', callback);
}

export function subscribeToStaff(callback: (staff: StaffMember[]) => void) {
  return createPollingSubscription<StaffMember>(
    '/staff',
    callback,
    {
      mapItems: (items) => items.map(normalizeStaff),
      sortFn: (a, b) => a.name.localeCompare(b.name),
    }
  );
}

export function subscribeToShifts(callback: (shifts: Shift[]) => void) {
  return createPollingSubscription<Shift>('/shifts', callback, {
    sortFn: (a, b) => b.id.localeCompare(a.id),
  });
}

export function subscribeToAlerts(callback: (alerts: EquipmentAlert[]) => void) {
  return createPollingSubscription<EquipmentAlert>('/alerts', callback);
}

// --- SEED DATABASE IF EMPTY ---

export async function seedDatabaseIfEmpty() {
  try {
    await apiJson('/init', { method: 'POST' });
    const staff = await apiJson<StaffMember[]>('/staff');
    if (staff.length === 0) {
      await resetWithApi();
      console.log('MySQL seeded with initial datasets.');
    }
  } catch (error) {
    console.error('Error while seeding MySQL database:', error);
  }
}

// --- SYSTEM RESET TOOL TO RESTORE DEFAULTS ---

export async function forceResetDatabase() {
  await resetWithApi();
}

// --- CRUD FOR EVENTS ---

export async function addEvent(event: Omit<LiveEvent, 'id'>) {
  const result = await apiJson<{ id: string }>('/events', {
    method: 'POST',
    body: JSON.stringify(event),
  });
  return result.id;
}

export async function updateEvent(eventId: string, eventData: Partial<LiveEvent>) {
  await apiJson(`/events/${eventId}`, {
    method: 'PATCH',
    body: JSON.stringify(eventData),
  });
}

export async function deleteEvent(eventId: string) {
  await apiJson(`/events/${eventId}`, { method: 'DELETE' });
}

// --- CRUD FOR STAFF ---

export async function addStaff(worker: Omit<StaffMember, 'id'>) {
  const result = await apiJson<{ id: string }>('/staff', {
    method: 'POST',
    body: JSON.stringify(worker),
  });
  return result.id;
}

export async function addStaffBatch(workers: Omit<StaffMember, 'id'>[]) {
  for (const worker of workers) {
    await addStaff(worker);
  }
}

export async function updateStaff(workerId: string, workerData: Partial<StaffMember>) {
  await apiJson(`/staff/${workerId}`, {
    method: 'PATCH',
    body: JSON.stringify(workerData),
  });
}

export async function deleteStaff(workerId: string) {
  await apiJson(`/staff/${workerId}`, { method: 'DELETE' });
}

// --- ATOMIC SHIFT OPERATIONS ---

export async function checkInWorker(workerId: string, eventId: string, location?: string, force = false) {
  return apiJson<ShiftToggleResult>('/checkin', {
    method: 'POST',
    body: JSON.stringify({ workerId, eventId, location, ...(force ? { force: true } : {}) }),
  });
}

export async function checkOutWorker(workerId: string) {
  return apiJson<ShiftToggleResult>('/checkout', {
    method: 'POST',
    body: JSON.stringify({ workerId }),
  });
}

// --- CRUD FOR SHIFTS ---

export async function addShift(shift: Omit<Shift, 'id'>) {
  const result = await apiJson<{ id: string }>('/shifts', {
    method: 'POST',
    body: JSON.stringify(shift),
  });
  return result.id;
}

export async function updateShift(shiftId: string, shiftData: Partial<Shift>) {
  await apiJson(`/shifts/${shiftId}`, {
    method: 'PATCH',
    body: JSON.stringify(shiftData),
  });
}

export async function deleteShift(shiftId: string) {
  await apiJson(`/shifts/${shiftId}`, { method: 'DELETE' });
}

// --- CRUD FOR ALERTS ---

export async function addAlert(alert: Omit<EquipmentAlert, 'id'>) {
  const result = await apiJson<{ id: string }>('/alerts', {
    method: 'POST',
    body: JSON.stringify(alert),
  });
  return result.id;
}

export async function updateAlert(alertId: string, alertData: Partial<EquipmentAlert>) {
  await apiJson(`/alerts/${alertId}`, {
    method: 'PATCH',
    body: JSON.stringify(alertData),
  });
}

export async function deleteAlert(alertId: string) {
  await apiJson(`/alerts/${alertId}`, { method: 'DELETE' });
}
