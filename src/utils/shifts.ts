import { LiveEvent, Shift, StaffMember } from '../types';
import {
  formatMadridShortDate,
  formatMadridTime,
  formatMadridTimeWithZone,
  getMadridCivilDateKey,
  getMadridCivilDateParts,
  getMadridZoneAbbreviation,
  madridCivilDateTimeToInstant,
  shiftMadridCivilDateKey,
} from './madridTime';

export type ShiftDateLike = Pick<Shift, 'dateString' | 'timespan'> &
  Partial<Pick<Shift, 'id' | 'startedAt' | 'endedAt' | 'updatedAt' | 'status'>>;

const MONTH_INDEX: Record<string, number> = {
  ENE: 0,
  JAN: 0,
  FEB: 1,
  MAR: 2,
  ABR: 3,
  APR: 3,
  MAY: 4,
  JUN: 5,
  JUL: 6,
  AGO: 7,
  AUG: 7,
  SEP: 8,
  OCT: 9,
  NOV: 10,
  DIC: 11,
  DEC: 11,
};

const ACTIVE_SHIFT_MAX_AGE_MS = 20 * 60 * 60 * 1000;
const FUTURE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;

export function getValidDateTimestamp(value?: string): number | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function extractShiftTimestampFromId(shiftId?: string): number | null {
  if (!shiftId) return null;
  const match = shiftId.match(/^sh_(\d{13})(?:_|$)/);
  if (!match) return null;
  const timestamp = Number(match[1]);
  return Number.isFinite(timestamp) ? timestamp : null;
}

function getClockParts(timespan: string): { hour: number; minute: number } {
  const startLabel = timespan.split(' - ')[0] || '00:00';
  const match = startLabel.match(/(\d{1,2}):(\d{2})/);
  if (!match) return { hour: 0, minute: 0 };

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function buildTimestamp(year: number, monthZeroBased: number, day: number, timespan: string): number | null {
  if (!Number.isFinite(year) || !Number.isFinite(monthZeroBased) || !Number.isFinite(day)) {
    return null;
  }

  const { hour, minute } = getClockParts(timespan);
  const parsed = madridCivilDateTimeToInstant({
    year,
    month: monthZeroBased + 1,
    day,
    hour,
    minute,
    second: 0,
  });
  const timestamp = parsed.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function buildTimestampFromDateKey(dateKey: string, timespan: string): number | null {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match
    ? buildTimestamp(Number(match[1]), Number(match[2]) - 1, Number(match[3]), timespan)
    : null;
}

function parseMonthToken(token: string): number | undefined {
  return MONTH_INDEX[token.slice(0, 3).toUpperCase()];
}

export function getShiftStartTimestamp(shift: ShiftDateLike): number | null {
  const canonicalStart = getValidDateTimestamp(shift.startedAt);
  if (canonicalStart !== null) return canonicalStart;

  const now = new Date();
  const madridNow = getMadridCivilDateParts(now);
  const trimmedDate = shift.dateString.trim();
  const normalized = trimmedDate.toLowerCase();

  const isoMatch = normalized.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (isoMatch) {
    const timestamp = buildTimestamp(Number(isoMatch[1]), Number(isoMatch[2]) - 1, Number(isoMatch[3]), shift.timespan);
    if (timestamp !== null) return timestamp;
  }

  const slashDateMatch = normalized.match(/(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})/);
  if (slashDateMatch) {
    const first = Number(slashDateMatch[1]);
    const second = Number(slashDateMatch[2]);
    const rawYear = Number(slashDateMatch[3]);
    const year = rawYear < 100 ? 2000 + rawYear : rawYear;
    const day = first <= 12 && second > 12 ? second : first;
    const month = first <= 12 && second > 12 ? first - 1 : second - 1;
    const timestamp = buildTimestamp(year, month, day, shift.timespan);
    if (timestamp !== null) return timestamp;
  }

  const dayMonthMatch = trimmedDate.match(/(\d{1,2})[\s,.-]+([a-záéíóúñ]{3,9})/i);
  const dayMonth = dayMonthMatch ? parseMonthToken(dayMonthMatch[2]) : undefined;
  if (dayMonthMatch && dayMonth !== undefined) {
    const timestamp = buildTimestamp(madridNow.year, dayMonth, Number(dayMonthMatch[1]), shift.timespan);
    if (timestamp !== null) return timestamp;
  }

  const monthDayMatch = trimmedDate.match(/([a-záéíóúñ]{3,9})[\s,.-]+(\d{1,2})/i);
  const monthDay = monthDayMatch ? parseMonthToken(monthDayMatch[1]) : undefined;
  if (monthDayMatch && monthDay !== undefined) {
    const timestamp = buildTimestamp(madridNow.year, monthDay, Number(monthDayMatch[2]), shift.timespan);
    if (timestamp !== null) return timestamp;
  }

  const idTimestamp = extractShiftTimestampFromId(shift.id);
  if (idTimestamp !== null) return idTimestamp;

  const updatedAt = getValidDateTimestamp(shift.updatedAt);
  const referenceKey = getMadridCivilDateKey(updatedAt ?? now);
  const resolvedKey = normalized.startsWith('ayer') || normalized.startsWith('yesterday')
    ? shiftMadridCivilDateKey(referenceKey, -1)
    : referenceKey;
  return buildTimestampFromDateKey(resolvedKey, shift.timespan);
}

export function formatShiftDateLabel(shift: ShiftDateLike, now = new Date()): string {
  const trimmed = shift.dateString.trim();
  if (!trimmed) return 'Sin fecha';

  const shiftTime = getShiftStartTimestamp(shift);
  if (shiftTime === null) {
    return trimmed.replace('Today', 'Hoy').replace('Yesterday', 'Ayer');
  }

  const shiftKey = getMadridCivilDateKey(shiftTime);
  const todayKey = getMadridCivilDateKey(now);
  const yesterdayKey = shiftMadridCivilDateKey(todayKey, -1);
  const fullLabel = formatMadridShortDate(shiftTime);

  if (shiftKey === todayKey) return `Hoy · ${fullLabel}`;
  if (shiftKey === yesterdayKey) return `Ayer · ${fullLabel}`;
  return fullLabel;
}

export function formatShiftTimeRange(shift: ShiftDateLike, includeZone = false): string {
  const startTimestamp = getValidDateTimestamp(shift.startedAt);
  if (startTimestamp === null) {
    return shift.timespan.replace('Present', 'Presente');
  }

  const endTimestamp = getValidDateTimestamp(shift.endedAt);
  const startZone = getMadridZoneAbbreviation(startTimestamp);
  const endZone = endTimestamp === null ? '' : getMadridZoneAbbreviation(endTimestamp);
  const zoneChange = endTimestamp !== null && startZone !== endZone;
  const formatTime = includeZone || zoneChange ? formatMadridTimeWithZone : formatMadridTime;
  const startLabel = formatTime(startTimestamp);
  const endLabel = endTimestamp === null ? 'Presente' : formatTime(endTimestamp);
  return `${startLabel} - ${endLabel}`;
}

export function isShiftActiveNow(shift: Shift, now = new Date()): boolean {
  if (shift.status.toLowerCase() !== 'active') return false;

  const shiftStart = getShiftStartTimestamp(shift);
  if (shiftStart === null) return false;

  const nowTs = now.getTime();
  if (shiftStart > nowTs + FUTURE_CLOCK_TOLERANCE_MS) return false;

  const ageMs = nowTs - shiftStart;
  if (ageMs < 0 || ageMs > ACTIVE_SHIFT_MAX_AGE_MS) return false;

  return getMadridCivilDateKey(shiftStart) === getMadridCivilDateKey(now)
    || ageMs <= ACTIVE_SHIFT_MAX_AGE_MS;
}

export function getActiveShiftForWorker(shifts: Shift[], workerId: string, now = new Date()): Shift | null {
  return shifts
    .filter((shift) => shift.workerId === workerId && isShiftActiveNow(shift, now))
    .sort((a, b) => (getShiftStartTimestamp(b) || 0) - (getShiftStartTimestamp(a) || 0))[0] || null;
}

export function isWorkerPresentNow(worker: StaffMember, shifts: Shift[], now = new Date()): boolean {
  if (worker.status !== 'IN') return false;
  if (getActiveShiftForWorker(shifts, worker.id, now)) return true;

  const checkedInTs = getValidDateTimestamp(worker.checkedInTime);
  if (checkedInTs === null) return false;

  const ageMs = now.getTime() - checkedInTs;
  return ageMs >= 0 && ageMs <= ACTIVE_SHIFT_MAX_AGE_MS;
}

export function isShiftLinkedToEvent(shift: Shift, event: LiveEvent): boolean {
  return shift.eventId === event.id
    || shift.eventTitle.trim().toLowerCase() === event.title.trim().toLowerCase();
}
