import { describe, expect, it } from 'vitest';
import type { Shift } from '../../src/types';
import {
  formatDurationMinutes,
  formatShiftDuration,
  getShiftDurationMinutes,
  sumShiftDurationMinutes,
} from '../../src/utils/shifts';

function shift(partial: Partial<Shift>): Shift {
  return {
    id: 'shift-duration-test',
    workerId: 'worker-duration-test',
    dateString: '2026-07-19',
    timespan: '10:00 - 12:00',
    durationLabel: '0.0h',
    eventTitle: 'Evento duración',
    status: 'Completed',
    ...partial,
  };
}

describe('canonical shift duration', () => {
  it('fixes both demonstrated decimal-hour rounding cases at visible minute precision', () => {
    const twoHoursFourteenThirtyThree = shift({
      durationLabel: '2.2h',
      startedAt: '2026-07-19T10:00:00.000Z',
      endedAt: '2026-07-19T12:14:33.000Z',
    });
    const twoHoursFifteenTwentyNine = shift({
      durationLabel: '2.3h',
      startedAt: '2026-07-19T10:00:00.000Z',
      endedAt: '2026-07-19T12:15:29.000Z',
    });

    expect(getShiftDurationMinutes(twoHoursFourteenThirtyThree)).toBeCloseTo(134.55, 8);
    expect(getShiftDurationMinutes(twoHoursFifteenTwentyNine)).toBeCloseTo(135 + 29 / 60, 8);
    expect(formatShiftDuration(twoHoursFourteenThirtyThree)).toBe('2h 15m');
    expect(formatShiftDuration(twoHoursFifteenTwentyNine)).toBe('2h 15m');
  });

  it('falls back to the legacy decimal label when either canonical endpoint is missing', () => {
    const legacy = shift({
      durationLabel: '2.2h',
      startedAt: '2026-07-19T10:00:00.000Z',
      endedAt: undefined,
    });

    expect(getShiftDurationMinutes(legacy)).toBe(132);
    expect(formatShiftDuration(legacy)).toBe('2h 12m');
  });

  it('aggregates fractional minutes before applying half-up display rounding', () => {
    const shifts = [
      shift({ startedAt: '2026-07-19T10:00:00.000Z', endedAt: '2026-07-19T10:01:29.000Z' }),
      shift({ startedAt: '2026-07-19T11:00:00.000Z', endedAt: '2026-07-19T11:01:29.000Z' }),
    ];

    const totalMinutes = sumShiftDurationMinutes(shifts);
    expect(totalMinutes).toBeCloseTo(2 + 58 / 60, 8);
    expect(formatDurationMinutes(totalMinutes)).toBe('0h 03m');
  });

  it('keeps the Active duration label unchanged', () => {
    const active = shift({ durationLabel: 'Active', status: 'Active', endedAt: undefined });
    expect(getShiftDurationMinutes(active)).toBeNull();
    expect(formatShiftDuration(active)).toBe('Active');
  });
});
