import { describe, expect, it } from 'vitest';
import { MONTH_INDEX, parseEventDateTime } from '../../server/mysql/lifecycle/eventDateTime';

describe('parseEventDateTime', () => {
  it('parses Spanish month labels with the provided year and doors time', () => {
    const parsed = parseEventDateTime('09', 'JUL', '2026', '21:30');

    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(6);
    expect(parsed?.getDate()).toBe(9);
    expect(parsed?.getHours()).toBe(21);
    expect(parsed?.getMinutes()).toBe(30);
  });

  it('parses English fallback month labels used by the guard', () => {
    const parsed = parseEventDateTime('15', 'AUG', '2030', '08:05');

    expect(parsed?.getFullYear()).toBe(2030);
    expect(parsed?.getMonth()).toBe(7);
    expect(parsed?.getDate()).toBe(15);
    expect(parsed?.getHours()).toBe(8);
    expect(parsed?.getMinutes()).toBe(5);
  });

  it('falls back to the current year when dateYear is missing or out of range', () => {
    const parsed = parseEventDateTime('01', 'ENE', '1800', '00:00');

    expect(parsed?.getFullYear()).toBe(new Date().getFullYear());
    expect(parsed?.getMonth()).toBe(0);
    expect(parsed?.getDate()).toBe(1);
  });

  it('defaults invalid doorsOpen pieces to midnight components independently', () => {
    const parsed = parseEventDateTime('02', 'FEB', '2027', 'bad:also-bad');

    expect(parsed?.getFullYear()).toBe(2027);
    expect(parsed?.getMonth()).toBe(1);
    expect(parsed?.getDate()).toBe(2);
    expect(parsed?.getHours()).toBe(0);
    expect(parsed?.getMinutes()).toBe(0);
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
