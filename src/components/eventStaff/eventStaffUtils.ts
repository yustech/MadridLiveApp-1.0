import type { EventStaffMember, EventStaffRole, StaffMember } from '../../types';
import { filterRosterStaff } from '../roster/rosterSearch';

export const EVENT_STAFF_ROLES = ['Auxiliar', 'Auxiliar Plus', 'Coordinación'] as const;
export const EVENT_STAFF_PAGE_SIZE = 50;

export type RoleFilter = EventStaffRole | 'Todos';

export function getAvailableStaff(staff: StaffMember[], assigned: EventStaffMember[]): StaffMember[] {
  const assignedIds = new Set(assigned.map((worker) => worker.id));
  return staff.filter((worker) => !assignedIds.has(worker.id));
}

export function filterAvailableStaff(
  staff: StaffMember[],
  query: string,
  role: RoleFilter,
): StaffMember[] {
  return filterRosterStaff(staff, query).filter((worker) => role === 'Todos' || worker.role === role);
}

export function filterAssignedStaff(
  staff: EventStaffMember[],
  query: string,
  role: RoleFilter,
): EventStaffMember[] {
  return filterRosterStaff(staff, query).filter((worker) => role === 'Todos' || worker.assignedRole === role);
}

export function updateFilteredSelection(
  selectedIds: ReadonlySet<string>,
  filteredIds: string[],
  select: boolean,
): Set<string> {
  const next = new Set(selectedIds);
  filteredIds.forEach((id) => select ? next.add(id) : next.delete(id));
  return next;
}

export function countAssignedRoles(staff: EventStaffMember[]): Record<EventStaffRole, number> {
  return staff.reduce<Record<EventStaffRole, number>>((counts, worker) => {
    counts[worker.assignedRole] += 1;
    return counts;
  }, { Auxiliar: 0, 'Auxiliar Plus': 0, 'Coordinación': 0 });
}

export function getCoverage(assignedCount: number, requiredStaff: number) {
  const missing = Math.max(requiredStaff - assignedCount, 0);
  const excess = Math.max(assignedCount - requiredStaff, 0);
  const percent = requiredStaff > 0 ? Math.round((assignedCount / requiredStaff) * 100) : 100;
  return { assigned: assignedCount, required: requiredStaff, missing, excess, percent };
}
