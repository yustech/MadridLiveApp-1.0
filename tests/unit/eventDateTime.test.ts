import { describe, expect, it } from 'vitest';
import { MONTH_INDEX, parseEventDateTime } from '../../server/mysql/lifecycle/eventDateTime';
import { getMadridCivilDateParts } from '../../src/utils/madridTime';

describe('parseEventDateTime', () => {
  it('parses Spanish month labels with the provided year and doors time', () => {
    const parsed = parseEventDateTime('09', 'JUL', '2026', '21:30');

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString()).toBe('2026-07-09T19:30:00.000Z');
  });

  it('parses English fallback month labels used by the guard', () => {
    const parsed = parseEventDateTime('15', 'AUG', '2030', '08:05');

    expect(parsed?.toISOString()).toBe('2030-08-15T06:05:00.000Z');
  });

  it('parses numeric month values accepted by the event validator', () => {
    expect(parseEventDateTime('19', '7', '2026', '23:00')?.toISOString()).toBe('2026-07-19T21:00:00.000Z');
  });

  it('falls back to the current year when dateYear is missing or out of range', () => {
    const parsed = parseEventDateTime('01', 'ENE', '1800', '00:00');

    expect(getMadridCivilDateParts(parsed!)).toEqual({
      year: getMadridCivilDateParts().year,
      month: 1,
      day: 1,
    });
  });

  it('defaults invalid doorsOpen pieces to midnight components independently', () => {
    const parsed = parseEventDateTime('02', 'FEB', '2027', 'bad:also-bad');

    expect(parsed?.toISOString()).toBe('2027-02-01T23:00:00.000Z');
  });

  it('returns null for invalid day or unknown month labels', () => {
    expect(parseEventDateTime('32', 'JUL', '2026', '21:30')).toBeNull();
    expect(parseEventDateTime('10', '???', '2026', '21:30')).toBeNull();
  });
});

describe('MONTH_INDEX', () => {
  it('keeps the Spanish and English month aliases used by event guards', () => {
    expect(MONTH_INDEX.ENE).toBe(0);
    expect(MONTH_INDEX.JAN).toBe(0);
    expect(MONTH_INDEX.ABR).toBe(3);
    expect(MONTH_INDEX.APR).toBe(3);
    expect(MONTH_INDEX.AGO).toBe(7);
    expect(MONTH_INDEX.AUG).toBe(7);
    expect(MONTH_INDEX.DIC).toBe(11);
    expect(MONTH_INDEX.DEC).toBe(11);
  });
});
