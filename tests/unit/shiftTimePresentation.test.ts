import { describe, expect, it } from 'vitest';
import { formatShiftDateLabel, formatShiftTimeRange } from '../../src/utils/shifts';
import type { Shift } from '../../src/types';

function shift(partial: Partial<Shift>): Shift {
  return {
    id: 'shift-time-test',
    workerId: 'worker-time-test',
    dateString: 'legacy date',
    timespan: '09:00 - 10:00',
    durationLabel: '1.0h',
    eventTitle: 'Evento temporal',
    status: 'Completed',
    ...partial,
  };
}

describe('shift presentation in Madrid', () => {
  it('prefers canonical timestamps over the legacy timespan', () => {
    expect(formatShiftTimeRange(shift({
      startedAt: '2026-07-18T22:30:00Z',
      endedAt: '2026-07-19T00:30:00Z',
    }))).toBe('00:30 - 02:30');
  });

  it('keeps the legacy range only when canonical timestamps are missing', () => {
    expect(formatShiftTimeRange(shift({ timespan: '09:00 - Present' }))).toBe('09:00 - Presente');
  });

  it('adds CET/CEST when a range crosses the repeated autumn hour', () => {
    expect(formatShiftTimeRange(shift({
      startedAt: '2026-10-25T00:30:00Z',
      endedAt: '2026-10-25T01:30:00Z',
    }))).toBe('02:30 CEST - 02:30 CET');
  });

  it('groups the date by the Madrid civil day', () => {
    const value = shift({ startedAt: '2026-07-18T22:30:00Z' });
    expect(formatShiftDateLabel(value, new Date('2026-07-18T22:45:00Z'))).toMatch(/^Hoy · 19 jul/i);
  });
});
