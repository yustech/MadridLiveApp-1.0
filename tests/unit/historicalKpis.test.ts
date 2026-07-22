import { describe, expect, it } from 'vitest';
import type { LiveEvent, Shift, StaffMember } from '../../src/types';
import { computeHistoricalKpis, getScopedCompletedShifts } from '../../src/utils/historicalKpis';

const event: LiveEvent = {
  id: 'event-history', title: 'Evento Histórico', location: 'Madrid', dateDay: '20', dateMonth: 'JUL',
  dateYear: '2026', doorsOpen: '18:00', requiredStaff: 4, activeStaff: 0, totalStaffNeeded: 4,
  scanRate: 0, loadInPercent: 100,
};

const staff: StaffMember[] = [
  { id: 'worker-a', idCode: 'A-1', name: 'Ana', role: 'Auxiliar', roleLabel: 'Auxiliar', status: 'OUT', avatar: '', totalHours: 0, currentShiftHours: 0, currentShiftMins: 0 },
  { id: 'worker-b', idCode: 'B-1', name: 'Berta', role: 'Coordinación', roleLabel: 'Coordinación', status: 'OUT', avatar: '', totalHours: 0, currentShiftHours: 0, currentShiftMins: 0 },
];

function shift(id: string, workerId: string, startedAt?: string, endedAt?: string, overrides: Partial<Shift> = {}): Shift {
  return {
    id, workerId, dateString: '2026-07-20', timespan: '10:00 - 12:00', durationLabel: 'Active',
    eventId: event.id, eventTitle: event.title, status: 'Completed', startedAt, endedAt, ...overrides,
  };
}

describe('historical KPIs', () => {
  it('aggregates an event by unique worker, exact duration, role and coverage', () => {
    const result = computeHistoricalKpis({
      event, staff,
      shifts: [
        shift('s1', 'worker-a', '2026-07-20T08:00:00Z', '2026-07-20T10:12:00Z'),
        shift('s2', 'worker-a', '2026-07-20T11:00:00Z', '2026-07-20T13:13:00Z'),
        shift('s3', 'worker-b', '2026-07-20T14:00:00Z', '2026-07-20T15:00:00Z'),
      ],
    });

    expect(result.completedShifts).toBe(3);
    expect(result.uniqueWorkers).toBe(2);
    expect(result.totalMinutes).toBe(325);
    expect(result.avgShiftMinutes).toBeCloseTo(325 / 3);
    expect(result.coveragePct).toBe(50);
    expect(result.topStaffByHours.map(({ id, minutes }) => ({ id, minutes }))).toEqual([
      { id: 'worker-a', minutes: 265 }, { id: 'worker-b', minutes: 60 },
    ]);
    expect(result.roleStats).toEqual([
      { role: 'Auxiliar', label: 'Auxiliar', count: 1, pct: 50 },
      { role: 'Coordinación', label: 'Coordinación', count: 1, pct: 50 },
    ]);
  });

  it('preserves exact minute totals instead of decimal-hour blocks', () => {
    const result = computeHistoricalKpis({ event, staff, shifts: [
      shift('s1', 'worker-a', '2026-07-20T08:00:00Z', '2026-07-20T10:12:00Z'),
      shift('s2', 'worker-b', '2026-07-20T11:00:00Z', '2026-07-20T13:13:00Z'),
    ] });
    expect(result.totalMinutes).toBe(265);
  });

  it('counts a duration-less completed shift without adding it to hours or top staff', () => {
    const result = computeHistoricalKpis({ event, staff, shifts: [shift('s1', 'worker-a')] });
    expect(result.completedShifts).toBe(1);
    expect(result.totalMinutes).toBe(0);
    expect(result.avgShiftMinutes).toBe(0);
    expect(result.topStaffByHours).toEqual([]);
  });

  it('keeps deleted workers as unknown and groups them under Otros', () => {
    const result = computeHistoricalKpis({ event, staff: [], shifts: [
      shift('s1', 'deleted-worker', '2026-07-20T08:00:00Z', '2026-07-20T09:00:00Z'),
    ] });
    expect(result.topStaffByHours[0]).toMatchObject({ idCode: 'deleted-worker', name: '(desconocido)', role: '' });
    expect(result.roleStats).toEqual([{ role: 'Otros', label: 'Otros / legacy', count: 1, pct: 100 }]);
  });

  it('aggregates every completed shift in all-events mode without coverage or timeline', () => {
    const otherEvent = { ...event, id: 'event-other', title: 'Otro' };
    const shifts = [
      shift('s1', 'worker-a', '2026-07-20T08:00:00Z', '2026-07-20T09:00:00Z'),
      shift('s2', 'worker-b', '2026-07-21T08:00:00Z', '2026-07-21T10:00:00Z', { eventId: otherEvent.id, eventTitle: otherEvent.title }),
      shift('active', 'worker-a', '2026-07-22T08:00:00Z', undefined, { status: 'Active' }),
    ];
    const result = computeHistoricalKpis({ event: null, events: [event, otherEvent], staff, shifts });
    expect(getScopedCompletedShifts(shifts, null)).toHaveLength(2);
    expect(result).toMatchObject({ scopeEventCount: 2, completedShifts: 2, totalMinutes: 180, coveragePct: null, timeline: [] });
  });

  it('returns zeros and empty lists for an empty scope', () => {
    expect(computeHistoricalKpis({ event, staff, shifts: [] })).toEqual({
      scopeEventCount: 1, completedShifts: 0, uniqueWorkers: 0, totalMinutes: 0, avgShiftMinutes: 0,
      coveragePct: 0, topStaffByHours: [], roleStats: [], timeline: [],
    });
  });

  it('builds Madrid hourly buckets across midnight', () => {
    const result = computeHistoricalKpis({ event, staff, shifts: [
      shift('s1', 'worker-a', '2026-07-20T21:30:00Z', '2026-07-20T23:30:00Z'),
      shift('s2', 'worker-b', '2026-07-20T22:15:00Z', '2026-07-21T00:15:00Z'),
    ] });
    expect(result.timeline).toEqual([
      { label: '23:00 CEST', value: 1 },
      { label: '00:00 CEST', value: 1 },
      { label: '01:00 CEST', value: 0 },
      { label: '02:00 CEST', value: 0 },
    ]);
  });
});
