const LOWERCASE_NAME_PARTICLES = new Set(['de', 'la', 'del', 'los']);

// Exact light-mode categorical slots from dataviz/references/palette.md.
export const STAFF_AVATAR_COLORS = [
  '#2a78d6',
  '#008300',
  '#e87ba4',
  '#eda100',
  '#1baf7a',
  '#eb6834',
  '#4a3aa7',
  '#e34948',
] as const;

function stripAccents(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeInitialsToken(value: string): string {
  return stripAccents(value)
    .replace(/[^\p{L}\p{N}]/gu, '')
    .toLocaleUpperCase('es-ES');
}

function isLowercaseParticle(value: string): boolean {
  return value === value.toLocaleLowerCase('es-ES')
    && LOWERCASE_NAME_PARTICLES.has(stripAccents(value).toLocaleLowerCase('es-ES'));
}

export function getStaffInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const significantWords = words.filter((word) => !isLowercaseParticle(word));
  const normalizedWords = (significantWords.length > 0 ? significantWords : words)
    .map(normalizeInitialsToken)
    .filter(Boolean);

  if (normalizedWords.length === 0) return '??';

  const firstWord = Array.from(normalizedWords[0]);
  if (normalizedWords.length === 1) {
    return firstWord.slice(0, 2).join('');
  }

  const lastWord = Array.from(normalizedWords[normalizedWords.length - 1]);
  return `${firstWord[0] || ''}${lastWord[0] || ''}`;
}

export function hashStaffIdCode(idCode: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < idCode.length; index += 1) {
    hash ^= idCode.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function getStaffAvatarColor(idCode: string): typeof STAFF_AVATAR_COLORS[number] {
  return STAFF_AVATAR_COLORS[hashStaffIdCode(idCode) % STAFF_AVATAR_COLORS.length];
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((start) => Number.parseInt(hex.slice(start, start + 2), 16) / 255);
  const [red, green, blue] = channels.map((channel) => (
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  ));
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function getContrastRatio(firstHex: string, secondHex: string): number {
  const first = relativeLuminance(firstHex);
  const second = relativeLuminance(secondHex);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}

export function getStaffAvatarTextColor(background: string): '#000000' | '#ffffff' {
  const blackContrast = getContrastRatio(background, '#000000');
  const whiteContrast = getContrastRatio(background, '#ffffff');
  return blackContrast >= whiteContrast ? '#000000' : '#ffffff';
}

export function getStaffAvatarSource(avatar?: string | null): string | null {
  return avatar?.trim() || null;
}
