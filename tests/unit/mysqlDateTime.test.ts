import { describe, expect, it } from 'vitest';
import { formatClockLabel, toMysqlDateTimeValue } from '../../server/mysql/dateTime';

describe('MySQL UTC serialization', () => {
  it('serializes the represented instant with UTC getters', () => {
    expect(toMysqlDateTimeValue('2026-07-15T14:00:00+02:00')).toBe('2026-07-15 12:00:00');
    expect(toMysqlDateTimeValue('2026-01-15T13:00:00+01:00')).toBe('2026-01-15 12:00:00');
    expect(toMysqlDateTimeValue('2026-07-15T23:30:45-03:00')).toBe('2026-07-16 02:30:45');
    expect(toMysqlDateTimeValue('2026-07-15 12:00:00')).toBe('2026-07-15 12:00:00');
  });

  it('keeps invalid and empty values nullable', () => {
    expect(toMysqlDateTimeValue('not-a-date')).toBeNull();
    expect(toMysqlDateTimeValue(null)).toBeNull();
  });

  it('creates Madrid clock labels while the process runs in UTC', () => {
    expect(formatClockLabel(new Date('2026-07-15T12:00:00Z'))).toBe('14:00');
  });
});
