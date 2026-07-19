import type { LiveEvent, Shift, StaffMember } from '../types';
import {
  getValidDateTimestamp,
  isShiftActiveNow,
  isShiftLinkedToEvent,
  isWorkerPresentNow,
} from './shifts';

export const CHECKIN_RATE_WINDOW_MINUTES = 5;

export type CheckinRateStats = {
  count: number;
  ratePerMinute: number;
};

export type StaffingCoverage = {
  assigned: number;
  required: number;
  missing: number;
  excess: number;
  percent: number;
};

export function getRecentCheckinRate(
  shifts: Shift[],
  eventIds: string[],
  now = new Date(),
): CheckinRateStats {
  const includedEventIds = new Set(eventIds.filter(Boolean));
  if (includedEventIds.size === 0) return { count: 0, ratePerMinute: 0 };

  const nowTimestamp = now.getTime();
  const windowStart = nowTimestamp - CHECKIN_RATE_WINDOW_MINUTES * 60 * 1000;
  const count = shifts.filter((shift) => {
    if (!shift.eventId || !includedEventIds.has(shift.eventId)) return false;

    // Real-time check-in metrics must never reconstruct legacy timestamps.
    const startedAt = getValidDateTimestamp(shift.startedAt);
    return startedAt !== null && startedAt >= windowStart && startedAt <= nowTimestamp;
  }).length;

  return {
    count,
    ratePerMinute: Number((count / CHECKIN_RATE_WINDOW_MINUTES).toFixed(1)),
  };
}

export function getPresentStaffForEvent(
  staff: StaffMember[],
  shifts: Shift[],
  event: LiveEvent | null,
  now = new Date(),
): StaffMember[] {
  if (!event) return [];

  const eventShifts = shifts.filter((shift) => isShiftLinkedToEvent(shift, event));
  const activeWorkerIds = new Set(
    eventShifts
      .filter((shift) => isShiftActiveNow(shift, now))
      .map((shift) => shift.workerId),
  );

  return staff.filter((worker) => (
    activeWorkerIds.has(worker.id) && isWorkerPresentNow(worker, eventShifts, now)
  ));
}

export function getStaffingCoverage(assigned: number, required: number): StaffingCoverage {
  const safeAssigned = Math.max(Number(assigned) || 0, 0);
  const safeRequired = Math.max(Number(required) || 0, 0);

  return {
    assigned: safeAssigned,
    required: safeRequired,
    missing: Math.max(safeRequired - safeAssigned, 0),
    excess: Math.max(safeAssigned - safeRequired, 0),
    percent: safeRequired > 0 ? Math.round((safeAssigned / safeRequired) * 100) : 100,
  };
}

export function getEventStaffingCoverage(event: LiveEvent): StaffingCoverage {
  return getStaffingCoverage(
    event.assignedStaffCount ?? 0,
    event.requiredStaff ?? event.totalStaffNeeded ?? 0,
  );
}

export function hasEventStaffDeficit(event: LiveEvent): boolean {
  return getEventStaffingCoverage(event).missing > 0;
}

export function getEventListEmptyMessage(
  tab: 'upcoming' | 'past',
  showOnlyDeficit: boolean,
): string {
  if (tab === 'past') return 'No hay conciertos pasados archivados ahora mismo.';
  if (showOnlyDeficit) return 'No hay conciertos con déficit de personal para el filtro activo.';
  return 'No hay próximos conciertos.';
}
