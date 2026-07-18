import type { StaffRating } from '../../types';

export const STAFF_RATING_VALUES = [1, 2, 3, 4, 5] as const;

export const STAFF_RATING_COLORS: Record<StaffRating, string> = {
  1: '#d03b3b',
  2: '#ec835a',
  3: '#fab219',
  4: '#5a8200',
  5: '#0ca30c',
};

export function getStaffRatingColor(rating: StaffRating | null | undefined) {
  return rating ? STAFF_RATING_COLORS[rating] : undefined;
}

export function isStaffRating(value: unknown): value is StaffRating {
  return typeof value === 'number'
    && Number.isInteger(value)
    && STAFF_RATING_VALUES.includes(value as StaffRating);
}
