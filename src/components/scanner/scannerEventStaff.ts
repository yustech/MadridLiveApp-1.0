import type { EventStaffMember, LiveEvent, Shift } from '../../types';
import { isShiftLinkedToEvent } from '../../utils/shifts';

export function getPendingEventStaff(
  eventStaff: EventStaffMember[],
  shifts: Shift[],
  activeEvent: LiveEvent | null,
): EventStaffMember[] {
  if (!activeEvent) return [];

  const workersWithEventShift = new Set(
    shifts
      .filter((shift) => isShiftLinkedToEvent(shift, activeEvent))
      .map((shift) => shift.workerId),
  );

  return eventStaff.filter((worker) => !workersWithEventShift.has(worker.id));
}
