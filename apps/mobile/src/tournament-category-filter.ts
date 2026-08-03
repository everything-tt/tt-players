export const TOURNAMENT_CATEGORY_OPTIONS = [
  { value: 'cadet', label: 'Cadet' },
  { value: 'junior', label: 'Junior' },
  { value: 'senior', label: 'Senior / Open' },
  { value: 'veterans', label: 'Vets' },
  { value: 'women', label: 'Women' },
  { value: 'girls', label: 'Girls' },
] as const;

export type TournamentCategoryFilter = typeof TOURNAMENT_CATEGORY_OPTIONS[number]['value'];

export function toggleTournamentCategory(
  selected: TournamentCategoryFilter[],
  category: TournamentCategoryFilter,
): TournamentCategoryFilter[] {
  return selected.includes(category)
    ? selected.filter((value) => value !== category)
    : [...selected, category];
}
