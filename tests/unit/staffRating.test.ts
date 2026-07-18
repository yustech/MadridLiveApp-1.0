import { describe, expect, it } from 'vitest';
import {
  getStaffRatingColor,
  isStaffRating,
  STAFF_RATING_COLORS,
} from '../../src/components/ratings/staffRating';

describe('staff rating presentation contract', () => {
  it('pins the approved palette without light/dark variants', () => {
    expect(STAFF_RATING_COLORS).toEqual({
      1: '#d03b3b',
      2: '#ec835a',
      3: '#fab219',
      4: '#5a8200',
      5: '#0ca30c',
    });
    expect(getStaffRatingColor(4)).toBe('#5a8200');
    expect(getStaffRatingColor(null)).toBeUndefined();
  });

  it('recognizes only integer ratings from 1 to 5', () => {
    expect([1, 2, 3, 4, 5].every(isStaffRating)).toBe(true);
    expect([null, 0, 6, 2.5, '3'].some(isStaffRating)).toBe(false);
  });
});
