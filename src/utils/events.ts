import { LiveEvent } from '../types';
import {
  getMadridCivilDateKey,
  getMadridCivilDateParts,
  madridCivilDateKeyToInstant,
  madridCivilDateTimeToInstant,
  shiftMadridCivilDateKey,
} from './madridTime';

export type EventTemporalState = 'past' | 'today' | 'future' | 'unknown';

type EventRegistrationWindow = {
  startsAt: Date;
  endsAt: Date;
};

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

const MONTH_NAME: Record<string, string> = {
  ENE: 'Enero',
  JAN: 'Enero',
  FEB: 'Febrero',
  MAR: 'Marzo',
  ABR: 'Abril',
  APR: 'Abril',
  MAY: 'Mayo',
  JUN: 'Junio',
  JUL: 'Julio',
  AGO: 'Agosto',
  AUG: 'Agosto',
  SEP: 'Septiembre',
  OCT: 'Octubre',
  NOV: 'Noviembre',
  DIC: 'Diciembre',
  DEC: 'Diciembre',
};

function parseEventMonth(rawMonth: string): number | null {
  const normalized = rawMonth.trim().toUpperCase();
  const numericMonth = Number(normalized);

  if (Number.isInteger(numericMonth) && numericMonth >= 1 && numericMonth <= 12) {
    return numericMonth - 1;
  }

  return MONTH_INDEX[normalized] ?? null;
}

function parseEventYear(rawYear: string | undefined, now: Date): number {
  const parsedYear = Number(String(rawYear || '').trim());
  if (Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200) {
    return parsedYear;
  }

  return getMadridCivilDateParts(now).year;
}

function getEventCivilDateKey(event: LiveEvent, now = new Date()): string | null {
  const day = Number(event.dateDay);
  const month = parseEventMonth(event.dateMonth);
  const year = parseEventYear(event.dateYear, now);

  if (!Number.isInteger(day) || day < 1 || day > 31 || month === null) {
    return null;
  }

  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getEventDate(event: LiveEvent, now = new Date()): Date | null {
  const day = Number(event.dateDay);
  const month = parseEventMonth(event.dateMonth);
  const year = parseEventYear(event.dateYear, now);
  const [hourRaw, minuteRaw] = event.doorsOpen.split(':');

  if (!Number.isInteger(day) || day < 1 || day > 31 || month === null) {
    return null;
  }

  return madridCivilDateTimeToInstant({
    year,
    month: month + 1,
    day,
    hour: Number(hourRaw) || 0,
    minute: Number(minuteRaw) || 0,
    second: 0,
  });
}

export function getEventTemporalState(event?: LiveEvent | null, now = new Date()): EventTemporalState {
  if (!event) return 'unknown';

  const eventDateKey = getEventCivilDateKey(event, now);
  if (!eventDateKey) return 'unknown';

  const todayKey = getMadridCivilDateKey(now);
  if (eventDateKey < todayKey) return 'past';
  if (eventDateKey > todayKey) return 'future';
  return 'today';
}

export function getEventDefaultRegistrationWindow(
  event?: LiveEvent | null,
  now = new Date()
): EventRegistrationWindow | null {
  if (!event) return null;

  const eventDateKey = getEventCivilDateKey(event, now);
  if (!eventDateKey) return null;

  const startsAt = madridCivilDateKeyToInstant(eventDateKey);
  const afterWindowKey = shiftMadridCivilDateKey(eventDateKey, 2);
  const endsAt = new Date(madridCivilDateKeyToInstant(afterWindowKey).getTime() - 1);

  return { startsAt, endsAt };
}

export function isEventInDefaultRegistrationWindow(event?: LiveEvent | null, now = new Date()): boolean {
  const registrationWindow = getEventDefaultRegistrationWindow(event, now);
  if (!registrationWindow) return false;

  const nowTs = now.getTime();
  return nowTs >= registrationWindow.startsAt.getTime() && nowTs <= registrationWindow.endsAt.getTime();
}

export function isRegistrableEvent(event?: LiveEvent | null, now = new Date()): boolean {
  const state = getEventTemporalState(event, now);
  return state === 'today' || state === 'past';
}

export function requiresPastEventWarning(event?: LiveEvent | null, now = new Date()): boolean {
  return getEventTemporalState(event, now) === 'past';
}

export function isOperableEvent(event?: LiveEvent | null, now = new Date()): boolean {
  return isRegistrableEvent(event, now);
}

export function getEventStatusLabel(event?: LiveEvent | null): string {
  const state = getEventTemporalState(event);

  if (state === 'today') return 'Hoy';
  if (state === 'future') return 'Futuro';
  if (state === 'past') return 'Pasado';
  return 'Fecha sin validar';
}

export function getEventStatusTone(event?: LiveEvent | null): string {
  const state = getEventTemporalState(event);

  if (state === 'today') return 'text-emerald-300 border-emerald-400/30 bg-emerald-500/10';
  if (state === 'future') return 'text-sky-300 border-sky-400/30 bg-sky-500/10';
  if (state === 'past') return 'text-amber-300 border-amber-400/30 bg-amber-500/10';
  return 'text-white/60 border-white/15 bg-white/5';
}

export function formatEventDate(event: LiveEvent): string {
  const day = Number(event.dateDay);
  const monthKey = event.dateMonth.trim().toUpperCase();
  const numericMonth = Number(monthKey);
  const monthName = Number.isInteger(numericMonth)
    ? ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][numericMonth - 1]
    : MONTH_NAME[monthKey] || event.dateMonth;
  const year = parseEventYear(event.dateYear, new Date());

  return `${Number.isFinite(day) ? day : event.dateDay} ${monthName} ${year}`;
}

export function sortEventsByDate(events: LiveEvent[], direction: 'asc' | 'desc' = 'asc'): LiveEvent[] {
  const ordered = [...events].sort((a, b) => {
    const aTs = getEventDate(a)?.getTime() ?? Number.POSITIVE_INFINITY;
    const bTs = getEventDate(b)?.getTime() ?? Number.POSITIVE_INFINITY;
    return aTs - bTs;
  });

  return direction === 'asc' ? ordered : ordered.reverse();
}
