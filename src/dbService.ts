import { 
  collection, 
  onSnapshot, 
  doc, 
  getDocs, 
  getDoc,
  setDoc, 
  updateDoc, 
  deleteDoc, 
  writeBatch
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from './firebase';
import { LiveEvent, StaffMember, Shift, EquipmentAlert } from './types';
import { INITIAL_EVENTS, INITIAL_STAFF, INITIAL_SHIFTS, INITIAL_ALERTS } from './data';

// --- REAL-TIME LISTENERS ---

export function subscribeToEvents(callback: (events: LiveEvent[]) => void) {
  const path = 'events';
  const unsubscribe = onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items: LiveEvent[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as Omit<LiveEvent, 'id'>), id: docSnap.id });
      });
      // Sort optionally or preserve
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
  return unsubscribe;
}

export function subscribeToStaff(callback: (staff: StaffMember[]) => void) {
  const path = 'staff';
  const unsubscribe = onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items: StaffMember[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as Omit<StaffMember, 'id'>), id: docSnap.id });
      });
      // Preserve or sort alphabetically
      items.sort((a, b) => a.name.localeCompare(b.name));
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
  return unsubscribe;
}

export function subscribeToShifts(callback: (shifts: Shift[]) => void) {
  const path = 'shifts';
  const unsubscribe = onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items: Shift[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as Omit<Shift, 'id'>), id: docSnap.id });
      });
      // Sort shifts by ID or timestamp desc (Active first, then recent logs)
      items.sort((a, b) => b.id.localeCompare(a.id));
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
  return unsubscribe;
}

export function subscribeToAlerts(callback: (alerts: EquipmentAlert[]) => void) {
  const path = 'alerts';
  const unsubscribe = onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items: EquipmentAlert[] = [];
      snapshot.forEach((docSnap) => {
        items.push({ ...(docSnap.data() as Omit<EquipmentAlert, 'id'>), id: docSnap.id });
      });
      callback(items);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
  return unsubscribe;
}

// --- SEED DATABASE IF EMPTY ---

export async function seedDatabaseIfEmpty() {
  try {
    const staffPath = 'staff';
    const staffRef = collection(db, staffPath);
    const staffSnap = await getDocs(staffRef);

    if (staffSnap.empty) {
      console.log('Database empty! Seeding collections...');
      const batch = writeBatch(db);

      // Seed Staff
      INITIAL_STAFF.forEach((member) => {
        const { id, ...rest } = member;
        const ref = doc(db, 'staff', id);
        batch.set(ref, rest);
      });

      // Seed Events
      INITIAL_EVENTS.forEach((event) => {
        const { id, ...rest } = event;
        const ref = doc(db, 'events', id);
        batch.set(ref, rest);
      });

      // Seed Shifts
      INITIAL_SHIFTS.forEach((shift) => {
        const { id, ...rest } = shift;
        const ref = doc(db, 'shifts', id);
        batch.set(ref, rest);
      });

      // Seed Alerts
      INITIAL_ALERTS.forEach((alert) => {
        const { id, ...rest } = alert;
        const ref = doc(db, 'alerts', id);
        batch.set(ref, rest);
      });

      await batch.commit();
      console.log('Collections successfully seeded into Firestore.');
    } else {
      console.log('Database already has records. Seeding skipped.');
    }
  } catch (err) {
    console.error('Error auto-seeding database:', err);
    // Silent catch so it doesn't break app start
  }
}

// --- SYSTEM RESET TOOL TO RESTORE DEFAULTS ---
export async function forceResetDatabase() {
  const staffPath = 'staff';
  try {
    const batch = writeBatch(db);

    // Fetch and delete all current records
    const collections = ['staff', 'events', 'shifts', 'alerts'];
    for (const colName of collections) {
      const colSnap = await getDocs(collection(db, colName));
      colSnap.forEach((docSnap) => {
        batch.delete(docSnap.ref);
      });
    }

    // Now write initial records
    INITIAL_STAFF.forEach((member) => {
      const { id, ...rest } = member;
      batch.set(doc(db, 'staff', id), rest);
    });

    INITIAL_EVENTS.forEach((event) => {
      const { id, ...rest } = event;
      batch.set(doc(db, 'events', id), rest);
    });

    INITIAL_SHIFTS.forEach((shift) => {
      const { id, ...rest } = shift;
      batch.set(doc(db, 'shifts', id), rest);
    });

    INITIAL_ALERTS.forEach((alert) => {
      const { id, ...rest } = alert;
      batch.set(doc(db, 'alerts', id), rest);
    });

    await batch.commit();
    console.log('Database hard reset complete.');
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, staffPath);
  }
}

// --- CRUD FOR EVENTS ---

export async function addEvent(event: Omit<LiveEvent, 'id'>) {
  const path = 'events';
  const idStr = `ev_${Date.now()}`;
  try {
    await setDoc(doc(db, path, idStr), { ...event, id: idStr });
    return idStr;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${path}/${idStr}`);
    throw error;
  }
}

export async function updateEvent(eventId: string, eventData: Partial<LiveEvent>) {
  const path = `events/${eventId}`;
  try {
    const ref = doc(db, 'events', eventId);
    await updateDoc(ref, eventData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function deleteEvent(eventId: string) {
  const path = `events/${eventId}`;
  try {
    await deleteDoc(doc(db, 'events', eventId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

// --- CRUD FOR STAFF ---

export async function addStaff(worker: Omit<StaffMember, 'id'>) {
  const path = 'staff';
  const idStr = `usr_${Date.now()}`;
  try {
    await setDoc(doc(db, path, idStr), { ...worker, id: idStr });
    return idStr;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${path}/${idStr}`);
    throw error;
  }
}

export async function addStaffBatch(workers: Omit<StaffMember, 'id'>[]) {
  const path = 'staff';
  try {
    const batch = writeBatch(db);
    workers.forEach((worker, index) => {
      // Offset timestamps slightly to guarantee unique/ordered IDs
      const idStr = `usr_${Date.now()}_${index}_${Math.floor(Math.random() * 1000)}`;
      const ref = doc(db, 'staff', idStr);
      batch.set(ref, { ...worker, id: idStr });
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
    throw error;
  }
}

export async function updateStaff(workerId: string, workerData: Partial<StaffMember>) {
  const path = `staff/${workerId}`;
  try {
    const ref = doc(db, 'staff', workerId);
    await updateDoc(ref, workerData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function deleteStaff(workerId: string) {
  const path = `staff/${workerId}`;
  try {
    await deleteDoc(doc(db, 'staff', workerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

// --- CRUD FOR SHIFTS ---

export async function addShift(shift: Omit<Shift, 'id'>) {
  const path = 'shifts';
  const idStr = `sh_${Date.now()}`;
  try {
    await setDoc(doc(db, path, idStr), { ...shift, id: idStr });
    return idStr;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${path}/${idStr}`);
    throw error;
  }
}

export async function updateShift(shiftId: string, shiftData: Partial<Shift>) {
  const path = `shifts/${shiftId}`;
  try {
    const ref = doc(db, 'shifts', shiftId);
    await updateDoc(ref, shiftData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function deleteShift(shiftId: string) {
  const path = `shifts/${shiftId}`;
  try {
    await deleteDoc(doc(db, 'shifts', shiftId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}

// --- CRUD FOR ALERTS ---

export async function addAlert(alert: Omit<EquipmentAlert, 'id'>) {
  const path = 'alerts';
  const idStr = `al_${Date.now()}`;
  try {
    await setDoc(doc(db, path, idStr), { ...alert, id: idStr });
    return idStr;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `${path}/${idStr}`);
    throw error;
  }
}

export async function updateAlert(alertId: string, alertData: Partial<EquipmentAlert>) {
  const path = `alerts/${alertId}`;
  try {
    const ref = doc(db, 'alerts', alertId);
    await updateDoc(ref, alertData);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, path);
    throw error;
  }
}

export async function deleteAlert(alertId: string) {
  const path = `alerts/${alertId}`;
  try {
    await deleteDoc(doc(db, 'alerts', alertId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
    throw error;
  }
}
