import { describe, expect, it } from 'vitest';
import type { LiveEvent, Shift } from '../../src/types';
import {
  buildCreatePayload,
  buildPatchPayload,
  canConfirmEventDelete,
  getEventFormLocks,
  type EventFormValues,
} from '../../src/components/events/eventFormUtils';

const event: LiveEvent = {
  id: 'ev_1',
  title: 'Festival Madrid',
  location: 'IFEMA',
  dateDay: '08',
  dateMonth: 'JUL',
  dateYear: '2026',
  doorsOpen: '19:00',
  requiredStaff: 10,
  totalStaffNeeded: 10,
  activeStaff: 0,
  scanRate: 0,
  loadInPercent: 0,
};

const form: EventFormValues = {
  title: event.title,
  location: event.location,
  date: '2026-07-08',
  doorsOpen: event.doorsOpen,
  requiredStaff: '10',
};

function shift(partial: Partial<Shift>): Shift {
  return {
    id: 'sh_1',
    workerId: 'st_1',
    dateString: '',
    timespan: '',
    durationLabel: '',
    eventTitle: 'Otro',
    status: 'Completed',
    ...partial,
  };
}

describe('eventFormUtils', () => {
  it('counts linked shifts by event id and legacy title', () => {
    expect(getEventFormLocks(event, [])).toEqual({ dateLocked: false, shiftCount: 0 });
    expect(getEventFormLocks(event, [
      shift({ id: 'a', eventId: event.id }),
      shift({ id: 'b', eventTitle: ' festival madrid ' }),
      shift({ id: 'c', eventId: 'other', eventTitle: 'Otro' }),
    ])).toEqual({ dateLocked: true, shiftCount: 2 });
  });

  it('creates both required staff fields', () => {
    expect(buildCreatePayload({ ...form, requiredStaff: '12' })).toMatchObject({
      requiredStaff: 12,
      totalStaffNeeded: 12,
      dateDay: '08',
      dateMonth: 'JUL',
    });
  });

  it('patches only changed fields and mirrors required staff', () => {
    expect(buildPatchPayload(
      { ...form, title: 'Nuevo', requiredStaff: '12' },
      event,
      { dateLocked: false, shiftCount: 0 },
    )).toEqual({ title: 'Nuevo', requiredStaff: 12, totalStaffNeeded: 12 });
  });

  it('never patches date or doors when locked', () => {
    expect(buildPatchPayload(
      { ...form, date: '2026-08-09', doorsOpen: '20:00', location: 'Palacio' },
      event,
      { dateLocked: true, shiftCount: 1 },
    )).toEqual({ location: 'Palacio' });
  });

  it('confirms deletion ignoring surrounding spaces and case, but not empty', () => {
    expect(canConfirmEventDelete('Festival Madrid', event)).toBe(true);
    expect(canConfirmEventDelete('  festival madrid  ', event)).toBe(true);
    expect(canConfirmEventDelete('', event)).toBe(false);
    expect(canConfirmEventDelete('Festival', event)).toBe(false);
  });
});
