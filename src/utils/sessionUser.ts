export function getSessionUserInitials(email?: string | null): string {
  const localPart = email?.trim().split('@', 1)[0] || '';
  const parts = localPart.split(/[._-]+/).filter(Boolean);

  if (parts.length === 0) return '?';

  const firstInitial = Array.from(parts[0])[0] || '';
  if (parts.length === 1) return firstInitial.toLocaleUpperCase('es-ES');

  const lastInitial = Array.from(parts[parts.length - 1])[0] || '';
  return `${firstInitial}${lastInitial}`.toLocaleUpperCase('es-ES') || '?';
}
