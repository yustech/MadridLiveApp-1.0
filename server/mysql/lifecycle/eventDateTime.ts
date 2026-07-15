export const MONTH_INDEX: Record<string, number> = {
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

export function parseEventDateTime(dateDay?: string, dateMonth?: string, dateYear?: string, doorsOpen?: string) {
  const day = Number(String(dateDay || '').trim());
  const monthToken = String(dateMonth || '').trim().toUpperCase();
  const month = MONTH_INDEX[monthToken];
  const parsedYear = Number(String(dateYear || '').trim());
  const year = Number.isInteger(parsedYear) && parsedYear >= 1900 && parsedYear <= 2200
    ? parsedYear
    : new Date().getFullYear();

  if (!Number.isInteger(day) || day < 1 || day > 31 || month === undefined) {
    return null;
  }

  const [hourRaw, minRaw] = String(doorsOpen || '00:00').split(':');
  const hour = Number(hourRaw);
  const minute = Number(minRaw);
  const eventDate = new Date(
    year,
    month,
    day,
    Number.isFinite(hour) ? hour : 0,
    Number.isFinite(minute) ? minute : 0,
    0,
    0
  );

  if (Number.isNaN(eventDate.getTime())) {
    return null;
  }

  return eventDate;
}
