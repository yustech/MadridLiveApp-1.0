import { describe, expect, it } from 'vitest';
import {
  compareByRatingDesc,
  matchesRatingFilter,
  type RatingFilter,
} from '../../src/utils/staffRatingFilter';

describe('staff rating filters', () => {
  it('matches numeric filters as inclusive minimum thresholds', () => {
    expect(matchesRatingFilter(3, 3)).toBe(true);
    expect(matchesRatingFilter(2, 3)).toBe(false);
    expect(matchesRatingFilter(5, 1)).toBe(true);
  });

  it('handles unrated values for every filter kind', () => {
    const numericFilters: RatingFilter[] = [1, 2, 3, 4, 5];

    expect(matchesRatingFilter(null, 'All')).toBe(true);
    expect(matchesRatingFilter(undefined, 'All')).toBe(true);
    expect(matchesRatingFilter(null, 'Unrated')).toBe(true);
    expect(matchesRatingFilter(undefined, 'Unrated')).toBe(true);
    expect(matchesRatingFilter(3, 'Unrated')).toBe(false);

    for (const filter of numericFilters) {
      expect(matchesRatingFilter(null, filter)).toBe(false);
      expect(matchesRatingFilter(undefined, filter)).toBe(false);
    }
  });

  it('sorts ratings descending, unrated staff last, and ties by Spanish name', () => {
    const staff = [
      { name: 'Zoe', rating: null },
      { name: 'Óscar', rating: 4 },
      { name: 'Ana', rating: undefined },
      { name: 'Ángela', rating: 4 },
      { name: 'Bruno', rating: 5 },
    ];

    expect([...staff].sort(compareByRatingDesc).map(({ name }) => name)).toEqual([
      'Bruno',
      'Ángela',
      'Óscar',
      'Ana',
      'Zoe',
    ]);
  });
});
