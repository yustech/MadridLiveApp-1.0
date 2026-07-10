import { StaffMember } from '../types';

export const CORE_ROLES = ['Auxiliar', 'Auxiliar Plus', 'Coordinación'] as const;
export type CoreRole = (typeof CORE_ROLES)[number];

const ROLE_LABELS: Record<string, string> = {
  All: 'Todos los Roles',
  Auxiliar: 'Auxiliar',
  'Auxiliar Plus': 'Auxiliar Plus',
  Coordinación: 'Coordinación',
  ELECTRICIAN: 'Electricista',
  TECHNICIAN: 'Técnico',
  SECURITY: 'Seguridad',
  STAGEHAND: 'Stagehand',
};

export function getRoleDisplayName(role?: string): string {
  if (!role) return 'Sin rol';
  return ROLE_LABELS[role] || role;
}

export function getRoleBucket(role?: string): CoreRole | 'Otros' {
  if (role === 'Auxiliar' || role === 'Auxiliar Plus' || role === 'Coordinación') {
    return role;
  }

  return 'Otros';
}

export function getDynamicRoleFilters(staff: StaffMember[]): string[] {
  const seen = new Set<string>(['All']);

  CORE_ROLES.forEach((role) => {
    if (staff.some((member) => member.role === role)) {
      seen.add(role);
    }
  });

  staff
    .map((member) => member.role)
    .filter(Boolean)
    .sort((a, b) => getRoleDisplayName(a).localeCompare(getRoleDisplayName(b), 'es', { sensitivity: 'base' }))
    .forEach((role) => seen.add(role));

  return Array.from(seen);
}
