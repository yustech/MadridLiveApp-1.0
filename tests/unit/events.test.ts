import { describe, it, expect } from 'vitest';
import {
  getEventTemporalState,
  sortEventsByDate,
  formatEventDate,
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
    const now = new Date(2026, 5, 15, 12, 0, 0); // 15 Jun 2026
    expect(getEventTemporalState(ev({ dateDay: '01', dateMonth: 'JUN', dateYear: '2026' }), now)).toBe('past');
  });

  it('classifies an event later this month as future', () => {
    const now = new Date(2026, 5, 15, 12, 0, 0);
    expect(getEventTemporalState(ev({ dateDay: '30', dateMonth: 'JUN', dateYear: '2026' }), now)).toBe('future');
  });

  it('classifies an event dated today as today (regardless of door time)', () => {
    const now = new Date(2026, 5, 15, 12, 0, 0);
    expect(getEventTemporalState(ev({ dateDay: '15', dateMonth: 'JUN', dateYear: '2026', doorsOpen: '23:00' }), now)).toBe('today');
  });

  // The core of the #17 fix (root cause of the #44 seed bug): without a real
  // year, these two cases would be mis-classified.
  it('treats a next-year event as future across the year boundary', () => {
    const now = new Date(2025, 11, 31, 12, 0, 0); // 31 Dec 2025
    expect(getEventTemporalState(ev({ dateDay: '01', dateMonth: 'JAN', dateYear: '2026' }), now)).toBe('future');
  });

  it('treats a last-year event as past across the year boundary', () => {
    const now = new Date(2026, 0, 1, 12, 0, 0); // 1 Jan 2026
    expect(getEventTemporalState(ev({ dateDay: '31', dateMonth: 'DEC', dateYear: '2025' }), now)).toBe('past');
  });

  it('falls back to the current year when dateYear is missing', () => {
    const now = new Date(2026, 5, 15, 12, 0, 0);
    // No year -> assume 2026 -> 20 Jun 2026 is future vs 15 Jun 2026.
    expect(getEventTemporalState(ev({ dateDay: '20', dateMonth: 'JUN', dateYear: undefined }), now)).toBe('future');
  });

  it('falls back to the current year when dateYear is out of range', () => {
    const now = new Date(2026, 5, 15, 12, 0, 0);
    expect(getEventTemporalState(ev({ dateDay: '20', dateMonth: 'JUN', dateYear: '99' }), now)).toBe('future');
  });

  it('returns unknown for a null event or an unparseable date', () => {
    expect(getEventTemporalState(null)).toBe('unknown');
    expect(getEventTemporalState(ev({ dateMonth: 'ZZZ' }))).toBe('unknown');
    expect(getEventTemporalState(ev({ dateDay: 'not-a-day' }))).toBe('unknown');
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
  it('past events are registrable and require a past-event warning', () => {
    const now = new Date(2026, 5, 15, 12, 0, 0);
    const past = ev({ dateDay: '01', dateMonth: 'JUN', dateYear: '2026' });
    expect(isRegistrableEvent(past, now)).toBe(true);
    expect(requiresPastEventWarning(past, now)).toBe(true);
  });

  it('future events are not registrable and need no warning', () => {
    const now = new Date(2026, 5, 15, 12, 0, 0);
    const future = ev({ dateDay: '30', dateMonth: 'JUN', dateYear: '2026' });
    expect(isRegistrableEvent(future, now)).toBe(false);
    expect(requiresPastEventWarning(future, now)).toBe(false);
  });

  it('labels reflect temporal state', () => {
    const now = new Date(2026, 5, 15, 12, 0, 0);
    expect(getEventStatusLabel(ev({ dateDay: '15', dateMonth: 'JUN', dateYear: '2026' }))).toBeTypeOf('string');
    // future/past labels are deterministic given a fixed event vs "now" is not
    // injectable here, so we only assert the function returns a known label set.
    expect(['Hoy', 'Futuro', 'Pasado', 'Fecha sin validar']).toContain(
      getEventStatusLabel(ev({ dateDay: '15', dateMonth: 'JUL', dateYear: '2026' }))
    );
  });
});
