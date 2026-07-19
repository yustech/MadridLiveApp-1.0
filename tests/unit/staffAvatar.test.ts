import { describe, expect, it } from 'vitest';
import {
  getContrastRatio,
  getStaffAvatarColor,
  getStaffAvatarSource,
  getStaffAvatarTextColor,
  getStaffInitials,
  STAFF_AVATAR_COLORS,
} from '../../src/utils/staffAvatar';

describe('staff avatar presentation', () => {
  it('uses the first and last significant words for compound names', () => {
    expect(getStaffInitials('Miguel Ángel Robles Álvarez')).toBe('MA');
  });

  it('ignores lowercase particles without guessing surname boundaries', () => {
    expect(getStaffInitials('Alejandro de la Rosa Núñez')).toBe('AN');
    expect(getStaffInitials('María del Mar')).toBe('MM');
  });

  it('removes accents and uses two letters for a single word', () => {
    expect(getStaffInitials('Álvaro')).toBe('AL');
    expect(getStaffInitials('Íñigo López')).toBe('IL');
  });

  it('maps the same idCode to a stable approved categorical color', () => {
    expect(STAFF_AVATAR_COLORS).toEqual([
      '#2a78d6',
      '#008300',
      '#e87ba4',
      '#eda100',
      '#1baf7a',
      '#eb6834',
      '#4a3aa7',
      '#e34948',
    ]);
    expect(getStaffAvatarColor('MAD-L-842')).toBe(getStaffAvatarColor('MAD-L-842'));
    expect(STAFF_AVATAR_COLORS).toContain(getStaffAvatarColor('MAD-L-842'));
  });

  it('keeps every initials text/background pair at WCAG 4.5:1 or higher', () => {
    for (const background of STAFF_AVATAR_COLORS) {
      const textColor = getStaffAvatarTextColor(background);
      expect(getContrastRatio(background, textColor), `${background} with ${textColor}`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('preserves custom avatar sources and represents empty values without a data fallback', () => {
    const customAvatar = 'https://example.com/custom-worker.jpg';
    expect(getStaffAvatarSource(customAvatar)).toBe(customAvatar);
    expect(getStaffAvatarSource('')).toBeNull();
    expect(getStaffAvatarSource('   ')).toBeNull();
  });
});
