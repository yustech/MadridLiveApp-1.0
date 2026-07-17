import { describe, expect, it } from 'vitest';
import { filterRosterStaff, normalizeRosterSearch } from '../../src/components/roster/rosterSearch';

const staff = [
  { name: 'Ángela Muñoz', idCode: 'MAD-001', email: 'angela@example.com', phone: '+34 600 111 222' },
  { name: 'Óscar García', idCode: 'COOR-042', email: 'oscar.garcia@example.com', phone: '+34 611 333 444' },
  { name: 'Lucía Pérez', idCode: 'AUX-900', email: undefined, phone: undefined },
];

describe('roster search', () => {
  it('normalizes casing, accents and surrounding whitespace', () => {
    expect(normalizeRosterSearch('  COORDINACIÓN  ')).toBe('coordinacion');
  });

  it('matches names without distinguishing casing or accents', () => {
    expect(filterRosterStaff(staff, 'ANGELA')).toEqual([staff[0]]);
    expect(filterRosterStaff(staff, 'garcia')).toEqual([staff[1]]);
  });

  it('matches idCode, email and phone', () => {
    expect(filterRosterStaff(staff, 'coor-042')).toEqual([staff[1]]);
    expect(filterRosterStaff(staff, 'OSCAR.GARCIA@EXAMPLE')).toEqual([staff[1]]);
    expect(filterRosterStaff(staff, '600 111')).toEqual([staff[0]]);
  });

  it('returns every row for an empty query and tolerates absent optional fields', () => {
    expect(filterRosterStaff(staff, '  ')).toBe(staff);
    expect(filterRosterStaff(staff, 'lucia')).toEqual([staff[2]]);
  });
});
