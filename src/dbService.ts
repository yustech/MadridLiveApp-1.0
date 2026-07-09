import { LiveEvent, StaffMember, Shift, EquipmentAlert } from './types';
import { INITIAL_EVENTS, INITIAL_STAFF, INITIAL_SHIFTS, INITIAL_ALERTS } from './data';

const MYSQL_API_BASE = import.meta.env.VITE_MYSQL_API_BASE || '/api/mysql';
const POLL_MS = 3000;
const DEFAULT_STAFF_AVATAR = 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=100';

function normalizeStaffAvatar(worker: StaffMember): StaffMember {
  return {
    ...worker,
    avatar: worker.avatar?.trim() || DEFAULT_STAFF_AVATAR,
    location: worker.location?.trim() || '',
  };
}

function adminHeaders() {
  const token = import.meta.env.VITE_ADMIN_API_TOKEN;
  return token ? { 'x-admin-token': token } : {};
}

async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${MYSQL_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...adminHeaders(),
      ...(init?.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || `Request failed: ${response.status}`);
  }

  return response.json() as Promise<T>;
}

function createPollingSubscription<T>(path: string, callback: (items: T[]) => void, sortFn?: (a: T, b: T) => number) {
  let disposed = false;

  const load = async () => {
    try {
      const items = await apiJson<T[]>(path);
      if (disposed) return;
      if (sortFn) {
        items.sort(sortFn);
      }
      callback(items);
    } catch (error) {
      console.error(`MySQL polling error on ${path}:`, error);
    }
  };

  load();
  const timer = setInterval(load, POLL_MS);

  return () => {
    disposed = true;
    clearInterval(timer);
  };
}

async function resetWithApi() {
  const [staffNow, eventsNow, shiftsNow, alertsNow] = await Promise.all([
    apiJson<StaffMember[]>('/staff'),
    apiJson<LiveEvent[]>('/events'),
    apiJson<Shift[]>('/shifts'),
    apiJson<EquipmentAlert[]>('/alerts'),
  ]);

  const normalizedSeedShifts = INITIAL_SHIFTS.map((shift, index) => {
    const startedAt = shift.startedAt || new Date(Date.UTC(2026, 9, 20 + index, 10, 0, 0)).toISOString();
    const endedAt = shift.status === 'Completed' ? (shift.endedAt || new Date(Date.parse(startedAt) + 2 * 60 * 60 * 1000).toISOString()) : null;
    return {
      ...shift,
      dateString: shift.dateString.includes('T') ? shift.dateString : startedAt,
      startedAt,
      endedAt,
    };
  });

  const clearCollections = async (
    staffItems: StaffMember[],
    eventItems: LiveEvent[],
    shiftItems: Shift[],
    alertItems: EquipmentAlert[],
  ) => {
    for (const sh of shiftItems) await deleteShift(sh.id);
    for (const al of alertItems) await deleteAlert(al.id);
    for (const ev of eventItems) await deleteEvent(ev.id);
    for (const st of staffItems) await deleteStaff(st.id);
  };

  const restoreSnapshot = async () => {
    const staffIdMap = new Map<string, string>();

    for (const st of staffNow) {
      const { id: oldId, ...payload } = st;
      const newId = await addStaff(payload);
      staffIdMap.set(oldId, newId);
    }

    for (const ev of eventsNow) {
      const { id: _oldId, ...payload } = ev;
      await addEvent(payload);
    }

    for (const al of alertsNow) {
      const { id: _oldId, ...payload } = al;
      await addAlert(payload);
    }

    for (const sh of shiftsNow) {
      const { id: _oldId, workerId, ...payload } = sh;
      const mappedWorkerId = staffIdMap.get(workerId);
      if (!mappedWorkerId) continue;
      await addShift({ ...payload, workerId: mappedWorkerId });
    }
  };

  try {
    await clearCollections(staffNow, eventsNow, shiftsNow, alertsNow);

    const staffIdMap = new Map<string, string>();
    for (const st of INITIAL_STAFF) {
      const { id: oldId, ...payload } = st;
      const newId = await addStaff(payload);
      staffIdMap.set(oldId, newId);
    }

    for (const ev of INITIAL_EVENTS) {
      const { id: _oldId, ...payload } = ev;
      await addEvent(payload);
    }

    for (const al of INITIAL_ALERTS) {
      const { id: _oldId, ...payload } = al;
      await addAlert(payload);
    }

    for (const sh of normalizedSeedShifts) {
      const { id: _oldId, workerId, ...payload } = sh;
      const mappedWorkerId = staffIdMap.get(workerId);
      if (!mappedWorkerId) continue;
      await addShift({ ...payload, workerId: mappedWorkerId });
    }
  } catch (error) {
    console.error('MySQL reset failed after destructive step. Attempting rollback from snapshot.', error);

    try {
      const [staffAfter, eventsAfter, shiftsAfter, alertsAfter] = await Promise.all([
        apiJson<StaffMember[]>('/staff'),
        apiJson<LiveEvent[]>('/events'),
        apiJson<Shift[]>('/shifts'),
        apiJson<EquipmentAlert[]>('/alerts'),
      ]);

      await clearCollections(staffAfter, eventsAfter, shiftsAfter, alertsAfter);
      await restoreSnapshot();
      console.warn('Snapshot rollback completed after reset failure.');
    } catch (rollbackError) {
      console.error('Snapshot rollback failed after reset failure.', rollbackError);
    }

    throw error;
  }
}

// --- REAL-TIME-LIKE LISTENERS (polling) ---

export function subscribeToEvents(callback: (events: LiveEvent[]) => void) {
  return createPollingSubscription<LiveEvent>('/events', callback);
}

export function subscribeToStaff(callback: (staff: StaffMember[]) => void) {
  return createPollingSubscription<StaffMember>(
    '/staff',
    (items) => callback(items.map(normalizeStaffAvatar)),
    (a, b) => a.name.localeCompare(b.name)
  );
}

export function subscribeToShifts(callback: (shifts: Shift[]) => void) {
  return createPollingSubscription<Shift>('/shifts', callback, (a, b) => b.id.localeCompare(a.id));
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
