import { describe, expect, it } from 'vitest';
import type { EventStaffMember, StaffMember } from '../../src/types';
import {
  countAssignedRoles,
  filterAssignedStaff,
  filterAvailableStaff,
  getAvailableStaff,
  getCoverage,
  updateFilteredSelection,
} from '../../src/components/eventStaff/eventStaffUtils';

const worker = (overrides: Partial<StaffMember> = {}): StaffMember => ({
  id: 'staff-1',
  idCode: 'MAD-001',
  name: 'Álvaro Núñez',
  role: 'Auxiliar',
  roleLabel: 'Auxiliar',
  status: 'OUT',
  avatar: '',
  email: 'alvaro@example.com',
  phone: '+34 600 001 001',
  totalHours: 0,
  currentShiftHours: 0,
  currentShiftMins: 0,
  ...overrides,
});

const assigned = (overrides: Partial<EventStaffMember> = {}): EventStaffMember => ({
  id: 'staff-1',
  idCode: 'MAD-001',
  name: 'Álvaro Núñez',
  email: 'alvaro@example.com',
  phone: '+34 600 001 001',
  assignedRole: 'Auxiliar',
  createdAt: '2026-07-17T00:00:00.000Z',
  ...overrides,
});

describe('event staff filtering', () => {
  it('reuses accent/case-insensitive roster search and applies the role filter', () => {
    const staff = [
      worker(),
      worker({ id: 'staff-2', idCode: 'MAD-002', name: 'Mónica Pérez', role: 'Coordinación' }),
    ];

    expect(filterAvailableStaff(staff, 'ALVARO NUNEZ', 'Todos').map((item) => item.id)).toEqual(['staff-1']);
    expect(filterAvailableStaff(staff, 'monica', 'Coordinación').map((item) => item.id)).toEqual(['staff-2']);
    expect(filterAvailableStaff(staff, 'monica', 'Auxiliar')).toEqual([]);
  });

  it('filters assigned workers by their event role, not their base role', () => {
    const team = [assigned(), assigned({ id: 'staff-2', name: 'Lucía', assignedRole: 'Coordinación' })];
    expect(filterAssignedStaff(team, 'lucia', 'Coordinación').map((item) => item.id)).toEqual(['staff-2']);
  });

  it('removes assigned workers from the available roster', () => {
    const staff = [worker(), worker({ id: 'staff-2' })];
    expect(getAvailableStaff(staff, [assigned()]).map((item) => item.id)).toEqual(['staff-2']);
  });
});

describe('event staff filtered selection', () => {
  it('selects and clears all filtered ids without changing out-of-filter selections', () => {
    const selected = new Set(['outside']);
    const withFiltered = updateFilteredSelection(selected, ['staff-1', 'staff-2'], true);
    expect([...withFiltered].sort()).toEqual(['outside', 'staff-1', 'staff-2']);
    expect([...updateFilteredSelection(withFiltered, ['staff-1', 'staff-2'], false)]).toEqual(['outside']);
  });
});

describe('event staff counters', () => {
  it('counts assigned roles and reports missing/excess coverage', () => {
    const team = [
      assigned(),
      assigned({ id: 'staff-2', assignedRole: 'Auxiliar Plus' }),
      assigned({ id: 'staff-3', assignedRole: 'Coordinación' }),
      assigned({ id: 'staff-4', assignedRole: 'Coordinación' }),
    ];

    expect(countAssignedRoles(team)).toEqual({ Auxiliar: 1, 'Auxiliar Plus': 1, 'Coordinación': 2 });
    expect(getCoverage(team.length, 6)).toEqual({ assigned: 4, required: 6, missing: 2, excess: 0, percent: 67 });
    expect(getCoverage(7, 6)).toMatchObject({ missing: 0, excess: 1, percent: 117 });
  });
});
