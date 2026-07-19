import { formatMadridTime } from '../../src/utils/madridTime';

export function toMysqlDateTimeValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const rawValue = String(value).trim();
  const unzonedDateTime = rawValue.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)$/);
  const date = new Date(unzonedDateTime ? `${unzonedDateTime[1]}T${unzonedDateTime[2]}Z` : rawValue);
  if (Number.isNaN(date.getTime())) return null;

  const pad = (num: number) => String(num).padStart(2, '0');
  return (
    String(date.getUTCFullYear()) + '-' +
    pad(date.getUTCMonth() + 1) + '-' +
    pad(date.getUTCDate()) + ' ' +
    pad(date.getUTCHours()) + ':' +
    pad(date.getUTCMinutes()) + ':' +
    pad(date.getUTCSeconds())
  );
}

export function formatClockLabel(date: Date) {
  return formatMadridTime(date);
}
