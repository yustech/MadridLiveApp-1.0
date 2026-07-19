import { describe, expect, it } from 'vitest';
import { filterRosterStaff } from '../../src/components/roster/rosterSearch';
import { getPendingEventStaff } from '../../src/components/scanner/scannerEventStaff';
import type { EventStaffMember, LiveEvent, Shift } from '../../src/types';

const activeEvent: LiveEvent = {
  id: 'evt-current',
  title: 'Concierto Central',
  location: 'Sala Central',
  dateDay: '19',
  dateMonth: '7',
  dateYear: '2026',
  doorsOpen: '19:00',
  requiredStaff: 3,
  activeStaff: 0,
  totalStaffNeeded: 3,
  scanRate: 0,
  loadInPercent: 0,
};

const eventStaff: EventStaffMember[] = [
  {
    id: 'worker-active',
    idCode: 'MAD-001',
    name: 'Ángela Dentro',
    email: 'angela@example.com',
    phone: '+34 600 111 111',
    assignedRole: 'Auxiliar',
    createdAt: '2026-07-19T10:00:00.000Z',
  },
  {
    id: 'worker-completed',
    idCode: 'MAD-002',
    name: 'Óscar Finalizado',
    email: 'oscar@example.com',
    phone: '+34 600 222 222',
    assignedRole: 'Auxiliar Plus',
    createdAt: '2026-07-19T10:00:00.000Z',
  },
  {
    id: 'worker-pending',
    idCode: 'MAD-003',
    name: 'Lucía Pendiente',
    email: 'lucia@example.com',
    phone: '+34 600 333 333',
    assignedRole: 'Coordinación',
    createdAt: '2026-07-19T10:00:00.000Z',
  },
];

const shifts: Shift[] = [
  {
    id: 'shift-active',
    workerId: 'worker-active',
    dateString: '2026-07-19',
    timespan: '19:00 - Present',
    durationLabel: 'Active',
    eventId: activeEvent.id,
    eventTitle: activeEvent.title,
    status: 'Active',
  },
  {
    id: 'shift-completed',
    workerId: 'worker-completed',
    dateString: '2026-07-19',
    timespan: '17:00 - 18:00',
    durationLabel: '1h',
    eventId: activeEvent.id,
    eventTitle: activeEvent.title,
    status: 'Completed',
  },
  {
    id: 'shift-other-event',
    workerId: 'worker-pending',
    dateString: '2026-07-18',
    timespan: '17:00 - 18:00',
    durationLabel: '1h',
    eventId: 'evt-other',
    eventTitle: 'Otro concierto',
    status: 'Completed',
  },
];

describe('scanner event staff pending list', () => {
  it('excludes workers with any shift linked to the active event, including completed shifts', () => {
    expect(getPendingEventStaff(eventStaff, shifts, activeEvent)).toEqual([eventStaff[2]]);
  });

  it('does not calculate pending workers without an active event', () => {
    expect(getPendingEventStaff(eventStaff, shifts, null)).toEqual([]);
  });

  it('filters pending workers with the shared accent-insensitive roster matcher', () => {
    const pending = getPendingEventStaff(eventStaff, shifts, activeEvent);

    expect(filterRosterStaff(pending, 'LUCIA')).toEqual([eventStaff[2]]);
    expect(filterRosterStaff(pending, '600 333')).toEqual([eventStaff[2]]);
  });
});
