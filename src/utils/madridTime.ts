export const MADRID_TIME_ZONE = 'Europe/Madrid';

export type MadridCivilDateParts = {
  year: number;
  month: number;
  day: number;
};

export type MadridCivilDateTimeParts = MadridCivilDateParts & {
  hour: number;
  minute: number;
  second?: number;
};

type TemporalInput = Date | string | number;

const dateTimePartsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: MADRID_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

const dateFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: MADRID_TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const shortDateFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: MADRID_TIME_ZONE,
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const timeFormatter = new Intl.DateTimeFormat('es-ES', {
  timeZone: MADRID_TIME_ZONE,
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

const zoneFormatter = new Intl.DateTimeFormat('en-GB', {
  timeZone: MADRID_TIME_ZONE,
  timeZoneName: 'short',
});

function toValidDate(value: TemporalInput): Date | null {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function readNumericPart(parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes): number {
  return Number(parts.find((part) => part.type === type)?.value || Number.NaN);
}

export function getMadridCivilDateTimeParts(value: TemporalInput = new Date()): MadridCivilDateTimeParts {
  const date = toValidDate(value);
  if (!date) {
    throw new RangeError('Invalid temporal value.');
  }

  const parts = dateTimePartsFormatter.formatToParts(date);
  return {
    year: readNumericPart(parts, 'year'),
    month: readNumericPart(parts, 'month'),
    day: readNumericPart(parts, 'day'),
    hour: readNumericPart(parts, 'hour'),
    minute: readNumericPart(parts, 'minute'),
    second: readNumericPart(parts, 'second'),
  };
}

export function getMadridCivilDateParts(value: TemporalInput = new Date()): MadridCivilDateParts {
  const { year, month, day } = getMadridCivilDateTimeParts(value);
  return { year, month, day };
}

export function getMadridCivilDateKey(value: TemporalInput = new Date()): string {
  const { year, month, day } = getMadridCivilDateParts(value);
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function shiftMadridCivilDateKey(dateKey: string, days: number): string {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match || !Number.isInteger(days)) {
    throw new RangeError('Invalid Madrid civil date operation.');
  }

  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days, 12));
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function getTimeZoneOffsetMilliseconds(date: Date): number {
  const parts = getMadridCivilDateTimeParts(date);
  const representedAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second || 0
  );
  return representedAsUtc - Math.floor(date.getTime() / 1000) * 1000;
}

function matchesMadridCivilParts(date: Date, requested: Required<Pick<MadridCivilDateTimeParts, 'year' | 'month' | 'day' | 'hour' | 'minute'>>): boolean {
  const actual = getMadridCivilDateTimeParts(date);
  return actual.year === requested.year
    && actual.month === requested.month
    && actual.day === requested.day
    && actual.hour === requested.hour
    && actual.minute === requested.minute;
}

export function madridCivilDateTimeToInstant(parts: MadridCivilDateTimeParts): Date {
  const requested = {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
  };
  const second = parts.second || 0;
  const civilAsUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, second);
  if (!Number.isFinite(civilAsUtc)) {
    throw new RangeError('Invalid Madrid civil date-time.');
  }

  // Derive every candidate offset from Intl. This covers CET/CEST without encoding
  // either offset and also lets us detect the repeated autumn hour.
  const sampleWindowHours = [-36, -12, 0, 12, 36];
  const offsets = new Set(sampleWindowHours.map((hours) => (
    getTimeZoneOffsetMilliseconds(new Date(civilAsUtc + hours * 60 * 60 * 1000))
  )));
  const candidates = [...offsets]
    .map((offset) => new Date(civilAsUtc - offset))
    .filter((candidate) => matchesMadridCivilParts(candidate, requested))
    .sort((a, b) => a.getTime() - b.getTime());

  if (candidates.length > 0) {
    // Same compatible policy as the platform Date constructor: choose the first
    // occurrence when the autumn hour repeats.
    return candidates[0];
  }

  // A spring-gap wall time has no corresponding instant. Compatible resolution
  // advances it by the size of the gap, again using only offsets derived via Intl.
  const fallbackCandidates = [...offsets]
    .map((offset) => new Date(civilAsUtc - offset))
    .sort((a, b) => a.getTime() - b.getTime());
  return fallbackCandidates[fallbackCandidates.length - 1];
}

export function madridCivilDateKeyToInstant(dateKey: string, endExclusive = false): Date {
  const match = dateKey.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) throw new RangeError('Invalid Madrid civil date key.');
  const resolvedKey = endExclusive ? shiftMadridCivilDateKey(dateKey, 1) : dateKey;
  const resolved = resolvedKey.match(/^(\d{4})-(\d{2})-(\d{2})$/)!;
  return madridCivilDateTimeToInstant({
    year: Number(resolved[1]),
    month: Number(resolved[2]),
    day: Number(resolved[3]),
    hour: 0,
    minute: 0,
    second: 0,
  });
}

export function formatMadridDate(value: TemporalInput): string {
  const date = toValidDate(value);
  return date ? dateFormatter.format(date) : '—';
}

export function formatMadridShortDate(value: TemporalInput): string {
  const date = toValidDate(value);
  return date ? shortDateFormatter.format(date) : '—';
}

export function formatMadridTime(value: TemporalInput): string {
  const date = toValidDate(value);
  return date ? timeFormatter.format(date) : '—';
}

export function getMadridZoneAbbreviation(value: TemporalInput): string {
  const date = toValidDate(value);
  if (!date) return '';
  return zoneFormatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value || '';
}

export function formatMadridTimeWithZone(value: TemporalInput): string {
  const time = formatMadridTime(value);
  const zone = getMadridZoneAbbreviation(value);
  return zone ? `${time} ${zone}` : time;
}

export function formatMadridDateTime(value: TemporalInput, includeZone = false): string {
  const date = toValidDate(value);
  if (!date) return '—';
  const label = `${dateFormatter.format(date)}, ${timeFormatter.format(date)}`;
  const zone = includeZone ? getMadridZoneAbbreviation(date) : '';
  return zone ? `${label} ${zone}` : label;
}
