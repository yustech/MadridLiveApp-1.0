import { describe, it, expect } from 'vitest';
import {
  getEventTemporalState,
  sortEventsByDate,
  formatEventDate,
  getEventDefaultRegistrationWindow,
  isRegistrableEvent,
  requiresPastEventWarning,
  getEventStatusLabel,
} from '../../src/utils/events';
import type { LiveEvent } from '../../src/types';

// Minimal factory: events.ts only reads dateDay / dateMonth / dateYear / doorsOpen.
function ev(partial: Partial<LiveEvent>): LiveEvent {
  return {
    id: 'ev_test',
    title: 'Test Event',
    location: 'Test Venue',
    dateDay: '15',
    dateMonth: 'JUL',
    dateYear: '2026',
    doorsOpen: '20:00',
    ...partial,
  } as unknown as LiveEvent;
}

describe('getEventTemporalState', () => {
  it('classifies an event earlier today-or-before as past', () => {
    const now = new Date('2026-06-15T10:00:00Z'); // 15 Jun 2026 in Madrid
    expect(getEventTemporalState(ev({ dateDay: '01', dateMonth: 'JUN', dateYear: '2026' }), now)).toBe('past');
  });

  it('classifies an event later this month as future', () => {
    const now = new Date('2026-06-15T10:00:00Z');
    expect(getEventTemporalState(ev({ dateDay: '30', dateMonth: 'JUN', dateYear: '2026' }), now)).toBe('future');
  });

  it('classifies an event dated today as today (regardless of door time)', () => {
    const now = new Date('2026-06-15T10:00:00Z');
    expect(getEventTemporalState(ev({ dateDay: '15', dateMonth: 'JUN', dateYear: '2026', doorsOpen: '23:00' }), now)).toBe('today');
  });

  // The core of the #17 fix (root cause of the #44 seed bug): without a real
  // year, these two cases would be mis-classified.
  it('treats a next-year event as future across the year boundary', () => {
    const now = new Date('2025-12-31T11:00:00Z'); // 31 Dec 2025 in Madrid
    expect(getEventTemporalState(ev({ dateDay: '01', dateMonth: 'JAN', dateYear: '2026' }), now)).toBe('future');
  });

  it('treats a last-year event as past across the year boundary', () => {
    const now = new Date('2026-01-01T11:00:00Z'); // 1 Jan 2026 in Madrid
    expect(getEventTemporalState(ev({ dateDay: '31', dateMonth: 'DEC', dateYear: '2025' }), now)).toBe('past');
  });

  it('falls back to the current year when dateYear is missing', () => {
    const now = new Date('2026-06-15T10:00:00Z');
    // No year -> assume 2026 -> 20 Jun 2026 is future vs 15 Jun 2026.
    expect(getEventTemporalState(ev({ dateDay: '20', dateMonth: 'JUN', dateYear: undefined }), now)).toBe('future');
  });

  it('falls back to the current year when dateYear is out of range', () => {
    const now = new Date('2026-06-15T10:00:00Z');
    expect(getEventTemporalState(ev({ dateDay: '20', dateMonth: 'JUN', dateYear: '99' }), now)).toBe('future');
  });

  it('returns unknown for a null event or an unparseable date', () => {
    expect(getEventTemporalState(null)).toBe('unknown');
    expect(getEventTemporalState(ev({ dateMonth: 'ZZZ' }))).toBe('unknown');
    expect(getEventTemporalState(ev({ dateDay: 'not-a-day' }))).toBe('unknown');
  });

  it('classifies by the Madrid day after UTC crosses 22:00 in summer', () => {
    const now = new Date('2026-07-18T22:30:00Z'); // 19 Jul, 00:30 in Madrid
    expect(getEventTemporalState(ev({ dateDay: '18', dateMonth: 'JUL', dateYear: '2026' }), now)).toBe('past');
    expect(getEventTemporalState(ev({ dateDay: '19', dateMonth: 'JUL', dateYear: '2026' }), now)).toBe('today');
    expect(getEventTemporalState(ev({ dateDay: '20', dateMonth: 'JUL', dateYear: '2026' }), now)).toBe('future');
  });
});

describe('sortEventsByDate', () => {
  it('orders across years correctly (2025 before 2026 ascending)', () => {
    const e2026 = ev({ id: 'a', dateDay: '01', dateMonth: 'JAN', dateYear: '2026' });
    const e2025 = ev({ id: 'b', dateDay: '31', dateMonth: 'DEC', dateYear: '2025' });
    expect(sortEventsByDate([e2026, e2025], 'asc').map((e) => e.id)).toEqual(['b', 'a']);
    expect(sortEventsByDate([e2026, e2025], 'desc').map((e) => e.id)).toEqual(['a', 'b']);
  });

  it('does not mutate the input array', () => {
    const input = [ev({ id: 'a', dateDay: '02', dateMonth: 'JAN' }), ev({ id: 'b', dateDay: '01', dateMonth: 'JAN' })];
    const before = input.map((e) => e.id);
    sortEventsByDate(input, 'asc');
    expect(input.map((e) => e.id)).toEqual(before);
  });
});

describe('formatEventDate', () => {
  it('includes the real year in the formatted label', () => {
    expect(formatEventDate(ev({ dateDay: '15', dateMonth: 'JUL', dateYear: '2026' }))).toContain('2026');
  });
});

describe('registration helpers', () => {
  it('builds the two-day Madrid window across the spring DST transition', () => {
    const window = getEventDefaultRegistrationWindow(
      ev({ dateDay: '29', dateMonth: 'MAR', dateYear: '2026' }),
      new Date('2026-03-29T10:00:00Z'),
    );
    expect(window?.startsAt.toISOString()).toBe('2026-03-28T23:00:00.000Z');
    expect(window?.endsAt.toISOString()).toBe('2026-03-30T21:59:59.999Z');
  });

  it('builds the two-day Madrid window across the autumn DST transition', () => {
    const window = getEventDefaultRegistrationWindow(
      ev({ dateDay: '25', dateMonth: 'OCT', dateYear: '2026' }),
      new Date('2026-10-25T10:00:00Z'),
    );
    expect(window?.startsAt.toISOString()).toBe('2026-10-24T22:00:00.000Z');
    expect(window?.endsAt.toISOString()).toBe('2026-10-26T22:59:59.999Z');
  });

  it('past events are registrable and require a past-event warning', () => {
    const now = new Date('2026-06-15T10:00:00Z');
    const past = ev({ dateDay: '01', dateMonth: 'JUN', dateYear: '2026' });
    expect(isRegistrableEvent(past, now)).toBe(true);
    expect(requiresPastEventWarning(past, now)).toBe(true);
  });

  it('future events are not registrable and need no warning', () => {
    const now = new Date('2026-06-15T10:00:00Z');
    const future = ev({ dateDay: '30', dateMonth: 'JUN', dateYear: '2026' });
    expect(isRegistrableEvent(future, now)).toBe(false);
    expect(requiresPastEventWarning(future, now)).toBe(false);
  });

  it('labels reflect temporal state', () => {
    expect(getEventStatusLabel(ev({ dateDay: '15', dateMonth: 'JUN', dateYear: '2026' }))).toBeTypeOf('string');
    // future/past labels are deterministic given a fixed event vs "now" is not
    // injectable here, so we only assert the function returns a known label set.
    expect(['Hoy', 'Futuro', 'Pasado', 'Fecha sin validar']).toContain(
      getEventStatusLabel(ev({ dateDay: '15', dateMonth: 'JUL', dateYear: '2026' }))
    );
  });
});
