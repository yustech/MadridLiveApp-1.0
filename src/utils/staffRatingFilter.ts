export type RatingFilter = 'All' | 1 | 2 | 3 | 4 | 5 | 'Unrated';

type RatedStaff = {
  rating?: number | null;
  name: string;
};

export function matchesRatingFilter(
  rating: number | null | undefined,
  filter: RatingFilter,
): boolean {
  if (filter === 'All') return true;
  if (filter === 'Unrated') return rating == null;
  return typeof rating === 'number' && rating >= filter;
}

export function compareByRatingDesc(a: RatedStaff, b: RatedStaff): number {
  const aRated = typeof a.rating === 'number';
  const bRated = typeof b.rating === 'number';

  if (aRated && bRated && a.rating !== b.rating) {
    return (b.rating as number) - (a.rating as number);
  }
  if (aRated !== bRated) return aRated ? -1 : 1;
  return a.name.localeCompare(b.name, 'es', { sensitivity: 'base' });
}
