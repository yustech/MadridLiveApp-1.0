import { LiveEvent } from '../types';

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

export function getEventDate(event: LiveEvent, now = new Date()): Date | null {
  const day = Number(event.dateDay);
  const month = parseEventMonth(event.dateMonth);
  const [hourRaw, minuteRaw] = event.doorsOpen.split(':');

  if (!Number.isFinite(day) || month === null) {
    return null;
  }

  return new Date(
    now.getFullYear(),
    month,
    day,
    Number(hourRaw) || 0,
    Number(minuteRaw) || 0,
    0,
    0
  );
}

export function getEventTemporalState(event?: LiveEvent | null, now = new Date()): EventTemporalState {
  if (!event) return 'unknown';

  const eventDate = getEventDate(event, now);
  if (!eventDate) return 'unknown';

  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);

  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const eventTs = eventDate.getTime();
  if (eventTs < startOfToday.getTime()) return 'past';
  if (eventTs > endOfToday.getTime()) return 'future';
  return 'today';
}

export function getEventDefaultRegistrationWindow(
  event?: LiveEvent | null,
  now = new Date()
): EventRegistrationWindow | null {
  if (!event) return null;

  const eventDate = getEventDate(event, now);
  if (!eventDate) return null;

  const startsAt = new Date(eventDate);
  startsAt.setHours(0, 0, 0, 0);

  const endsAt = new Date(startsAt);
  endsAt.setDate(endsAt.getDate() + 1);
  endsAt.setHours(23, 59, 59, 999);

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
    ? new Date(new Date().getFullYear(), numericMonth - 1, 1).toLocaleString('es-ES', { month: 'long' })
    : MONTH_NAME[monthKey] || event.dateMonth;
  const year = String(new Date().getFullYear()).slice(-2);

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
