import { Shift, StaffMember, LiveEvent } from '../types';
import { formatMadridTimeWithZone, getMadridCivilDateKey } from './madridTime';
import { getRoleBucket, getRoleDisplayName } from './roles';
import {
  getShiftDurationMinutes,
  getShiftStartTimestamp,
  getValidDateTimestamp,
  isShiftLinkedToEvent,
} from './shifts';

export interface HistoricalTopStaff {
  id: string;
  idCode: string;
  name: string;
  role: string;
  minutes: number;
}

export interface HistoricalRoleStat {
  role: string;
  label: string;
  count: number;
  pct: number;
}

export interface HistoricalKpis {
  scopeEventCount: number;
  completedShifts: number;
  uniqueWorkers: number;
  totalMinutes: number;
  avgShiftMinutes: number;
  coveragePct: number | null;
  topStaffByHours: HistoricalTopStaff[];
  roleStats: HistoricalRoleStat[];
  timeline: { label: string; value: number }[];
}

export function getScopedCompletedShifts(shifts: Shift[], event: LiveEvent | null): Shift[] {
  return shifts.filter((shift) => (
    shift.status === 'Completed' && (event === null || isShiftLinkedToEvent(shift, event))
  ));
}

function computeTimeline(shifts: Shift[], event: LiveEvent | null): HistoricalKpis['timeline'] {
  if (event === null || shifts.length === 0) return [];

  const starts = shifts
    .map(getShiftStartTimestamp)
    .filter((timestamp): timestamp is number => timestamp !== null);
  const ends = shifts
    .map((shift) => getValidDateTimestamp(shift.endedAt))
    .filter((timestamp): timestamp is number => timestamp !== null);
  if (starts.length === 0 || ends.length === 0) return [];

  const firstHour = Math.floor(Math.min(...starts) / 3_600_000) * 3_600_000;
  const lastHour = Math.floor(Math.max(...ends) / 3_600_000) * 3_600_000;
  const hourCount = Math.floor((lastHour - firstHour) / 3_600_000) + 1;

  if (hourCount <= 24) {
    const counts = new Map<number, number>();
    starts.forEach((timestamp) => {
      const bucket = Math.floor(timestamp / 3_600_000) * 3_600_000;
      counts.set(bucket, (counts.get(bucket) || 0) + 1);
    });

    return Array.from({ length: hourCount }, (_, index) => {
      const timestamp = firstHour + index * 3_600_000;
      return { label: formatMadridTimeWithZone(timestamp), value: counts.get(timestamp) || 0 };
    });
  }

  const dayKeys = new Set<string>();
  for (let timestamp = firstHour; timestamp <= lastHour; timestamp += 3_600_000) {
    dayKeys.add(getMadridCivilDateKey(timestamp));
  }
  const counts = new Map<string, number>();
  starts.forEach((timestamp) => {
    const key = getMadridCivilDateKey(timestamp);
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...dayKeys].slice(-24).map((key) => ({ label: key, value: counts.get(key) || 0 }));
}

export function computeHistoricalKpis(input: {
  shifts: Shift[];
  staff: StaffMember[];
  event: LiveEvent | null;
  events?: LiveEvent[];
  now?: Date;
}): HistoricalKpis {
  const { shifts, staff, event, events } = input;
  const completed = getScopedCompletedShifts(shifts, event);
  const workerIds = new Set(completed.map((shift) => shift.workerId));
  const staffById = new Map(staff.map((worker) => [worker.id, worker]));
  const minutesByWorker = new Map<string, number>();
  let totalMinutes = 0;
  let shiftsWithDuration = 0;

  completed.forEach((shift) => {
    const minutes = getShiftDurationMinutes(shift);
    if (minutes === null) return;
    totalMinutes += minutes;
    shiftsWithDuration += 1;
    minutesByWorker.set(shift.workerId, (minutesByWorker.get(shift.workerId) || 0) + minutes);
  });

  const topStaffByHours = [...minutesByWorker.entries()]
    .map(([workerId, minutes]) => {
      const worker = staffById.get(workerId);
      return {
        id: workerId,
        idCode: worker?.idCode || workerId,
        name: worker?.name || '(desconocido)',
        role: worker?.role || '',
        minutes,
      };
    })
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name, 'es'))
    .slice(0, 5);

  const roleCounts = new Map<string, number>();
  workerIds.forEach((workerId) => {
    const role = staffById.get(workerId)?.role;
    const bucket = getRoleBucket(role);
    roleCounts.set(bucket, (roleCounts.get(bucket) || 0) + 1);
  });
  const roleStats = ['Auxiliar', 'Auxiliar Plus', 'Coordinación', 'Otros']
    .map((role) => ({
      role,
      label: role === 'Otros' ? 'Otros / legacy' : getRoleDisplayName(role),
      count: roleCounts.get(role) || 0,
      pct: workerIds.size ? Math.round(((roleCounts.get(role) || 0) / workerIds.size) * 100) : 0,
    }))
    .filter((item) => item.count > 0);

  const requiredStaff = event === null
    ? 0
    : Number(event.requiredStaff || event.totalStaffNeeded || 0);
  const inferredEventCount = new Set(completed.map((shift) => shift.eventId || shift.eventTitle)).size;

  return {
    scopeEventCount: event === null ? events?.length ?? inferredEventCount : 1,
    completedShifts: completed.length,
    uniqueWorkers: workerIds.size,
    totalMinutes,
    avgShiftMinutes: shiftsWithDuration ? totalMinutes / shiftsWithDuration : 0,
    coveragePct: event !== null && requiredStaff > 0
      ? Math.round((workerIds.size / requiredStaff) * 100)
      : null,
    topStaffByHours,
    roleStats,
    timeline: computeTimeline(completed, event),
  };
}
