import type { StaffMember } from '../../types';

export type RosterSearchable = Pick<StaffMember, 'name' | 'idCode' | 'email' | 'phone'>;

export function normalizeRosterSearch(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('es')
    .trim();
}

export function filterRosterStaff<T extends RosterSearchable>(staff: T[], query: string): T[] {
  const normalizedQuery = normalizeRosterSearch(query);
  if (!normalizedQuery) return staff;

  return staff.filter((worker) => (
    [worker.name, worker.idCode, worker.email, worker.phone]
      .some((value) => normalizeRosterSearch(value).includes(normalizedQuery))
  ));
}
