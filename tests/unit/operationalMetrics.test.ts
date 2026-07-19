import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveEvent, Shift, StaffMember } from '../../src/types';
import {
  getEventListEmptyMessage,
  getEventStaffingCoverage,
  getPresentStaffForEvent,
  getRecentCheckinRate,
  hasEventStaffDeficit,
} from '../../src/utils/operationalMetrics';

const event = (overrides: Partial<LiveEvent> = {}): LiveEvent => ({
  id: 'event-a',
  title: 'Evento A',
  location: 'Sala A',
  dateDay: '19',
  dateMonth: 'JUL',
  dateYear: '2026',
  doorsOpen: '19:00',
  requiredStaff: 5,
  assignedStaffCount: 0,
  activeStaff: 99,
  totalStaffNeeded: 5,
  scanRate: 88,
  loadInPercent: 0,
  ...overrides,
});

const shift = (overrides: Partial<Shift> = {}): Shift => ({
  id: 'shift-a',
  workerId: 'worker-a',
  dateString: 'Today',
  timespan: '11:59 - Present',
  durationLabel: 'Active',
  eventId: 'event-a',
  eventTitle: 'Evento A',
  status: 'Active',
  startedAt: '2026-07-19T11:59:00.000Z',
  ...overrides,
});

const worker = (overrides: Partial<StaffMember> = {}): StaffMember => ({
  id: 'worker-a',
  idCode: 'MAD-001',
  name: 'Trabajador A',
  role: 'Auxiliar',
  roleLabel: 'Auxiliar',
  status: 'IN',
  checkedInTime: '2026-07-19T11:55:00.000Z',
  avatar: '',
  totalHours: 0,
  currentShiftHours: 0,
  currentShiftMins: 5,
  ...overrides,
});

describe('operational metrics', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-19T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('uses only canonical startedAt values inside the five-minute window and filters by eventId', () => {
    const shifts = [
      shift(),
      shift({ id: 'completed', startedAt: '2026-07-19T11:57:00.000Z', status: 'Completed' }),
      shift({ id: 'boundary', startedAt: '2026-07-19T11:55:00.000Z' }),
      shift({ id: 'other-event', eventId: 'event-b', eventTitle: 'Evento B' }),
      shift({ id: 'too-old', startedAt: '2026-07-19T11:54:59.999Z' }),
      shift({ id: 'future', startedAt: '2026-07-19T12:00:00.001Z' }),
      shift({ id: 'invalid', startedAt: 'not-a-date' }),
      shift({ id: 'legacy', startedAt: undefined, dateString: 'Today', timespan: '11:59 - Present' }),
    ];

    expect(getRecentCheckinRate(shifts, ['event-a'])).toEqual({ count: 3, ratePerMinute: 0.6 });
    expect(getRecentCheckinRate(shifts, ['event-a', 'event-b'])).toEqual({ count: 4, ratePerMinute: 0.8 });
    expect(getRecentCheckinRate(shifts, [])).toEqual({ count: 0, ratePerMinute: 0 });
  });

  it('keeps simultaneous operational events separate when calculating current presence', () => {
    const eventA = event();
    const eventB = event({ id: 'event-b', title: 'Evento B' });
    const staff = [
      worker(),
      worker({ id: 'worker-b', idCode: 'MAD-002', name: 'Trabajador B' }),
      worker({ id: 'worker-without-event-shift', idCode: 'MAD-003', name: 'Sin turno del evento' }),
    ];
    const shifts = [
      shift(),
      shift({ id: 'shift-b', workerId: 'worker-b', eventId: eventB.id, eventTitle: eventB.title }),
    ];

    expect(getPresentStaffForEvent(staff, shifts, eventA).map((item) => item.id)).toEqual(['worker-a']);
    expect(getPresentStaffForEvent(staff, shifts, eventB).map((item) => item.id)).toEqual(['worker-b']);
  });

  it('derives deficit, complete coverage and excess from the real assigned count', () => {
    const withoutAssignments = event({ assignedStaffCount: 0 });
    const complete = event({ assignedStaffCount: 5 });
    const excess = event({ assignedStaffCount: 7 });

    expect(getEventStaffingCoverage(withoutAssignments)).toEqual({
      assigned: 0,
      required: 5,
      missing: 5,
      excess: 0,
      percent: 0,
    });
    expect(getEventStaffingCoverage(complete)).toMatchObject({ missing: 0, excess: 0, percent: 100 });
    expect(getEventStaffingCoverage(excess)).toMatchObject({ missing: 0, excess: 2, percent: 140 });
    expect(hasEventStaffDeficit(withoutAssignments)).toBe(true);
    expect(hasEventStaffDeficit(complete)).toBe(false);
    expect(hasEventStaffDeficit(excess)).toBe(false);
  });

  it('distinguishes an empty deficit filter from an empty upcoming event list', () => {
    expect(getEventListEmptyMessage('upcoming', true)).toBe(
      'No hay conciertos con déficit de personal para el filtro activo.',
    );
    expect(getEventListEmptyMessage('upcoming', false)).toBe('No hay próximos conciertos.');
    expect(getEventListEmptyMessage('past', false)).toBe('No hay conciertos pasados archivados ahora mismo.');
  });
});
