import { describe, expect, it } from 'vitest';
import {
  formatMadridDateTime,
  formatMadridTimeWithZone,
  getMadridCivilDateKey,
  getMadridCivilDateTimeParts,
  madridCivilDateTimeToInstant,
} from '../../src/utils/madridTime';

describe('Europe/Madrid temporal policy (process TZ=UTC)', () => {
  it('formats winter instants as CET', () => {
    expect(formatMadridTimeWithZone('2026-01-15T12:00:00Z')).toBe('13:00 CET');
  });

  it('formats summer instants as CEST', () => {
    expect(formatMadridTimeWithZone('2026-07-15T12:00:00Z')).toBe('14:00 CEST');
  });

  it('skips the nonexistent spring hour and resolves a civil gap compatibly', () => {
    expect(formatMadridTimeWithZone('2026-03-29T00:30:00Z')).toBe('01:30 CET');
    expect(formatMadridTimeWithZone('2026-03-29T01:30:00Z')).toBe('03:30 CEST');
    expect(madridCivilDateTimeToInstant({
      year: 2026,
      month: 3,
      day: 29,
      hour: 2,
      minute: 30,
    }).toISOString()).toBe('2026-03-29T01:30:00.000Z');
  });

  it('distinguishes both occurrences of the repeated autumn hour', () => {
    expect(formatMadridTimeWithZone('2026-10-25T00:30:00Z')).toBe('02:30 CEST');
    expect(formatMadridTimeWithZone('2026-10-25T01:30:00Z')).toBe('02:30 CET');
  });

  it('moves a summer UTC instant across Madrid midnight', () => {
    const instant = '2026-07-18T22:30:00Z';
    expect(getMadridCivilDateKey(instant)).toBe('2026-07-19');
    expect(getMadridCivilDateTimeParts(instant)).toMatchObject({
      year: 2026,
      month: 7,
      day: 19,
      hour: 0,
      minute: 30,
    });
    expect(formatMadridDateTime(instant)).toBe('19/07/2026, 00:30');
  });
});
