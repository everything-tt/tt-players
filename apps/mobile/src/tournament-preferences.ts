import type { TournamentListStatus } from './hooks/useTournamentList';
import {
  TOURNAMENT_CATEGORY_OPTIONS,
  type TournamentCategoryFilter,
} from './tournament-category-filter';
import {
  notifyUserDataChanged,
  TOURNAMENT_FILTERS_STORAGE_KEY,
} from './local-persistence';

export interface TournamentPreferences {
  version: 1;
  status: TournamentListStatus;
  savedOnly: boolean;
  categories: TournamentCategoryFilter[];
}

export const DEFAULT_TOURNAMENT_PREFERENCES: TournamentPreferences = {
  version: 1,
  status: 'upcoming',
  savedOnly: false,
  categories: [],
};

const VALID_CATEGORIES = new Set<string>(
  TOURNAMENT_CATEGORY_OPTIONS.map((option) => option.value),
);

export function readTournamentPreferences(
  storage: Pick<Storage, 'getItem'> = localStorage,
): TournamentPreferences {
  try {
    const raw = storage.getItem(TOURNAMENT_FILTERS_STORAGE_KEY);
    if (!raw) return DEFAULT_TOURNAMENT_PREFERENCES;

    const parsed = JSON.parse(raw) as Partial<TournamentPreferences> | null;
    if (!parsed || parsed.version !== 1) return DEFAULT_TOURNAMENT_PREFERENCES;

    const status: TournamentListStatus = parsed.status === 'completed' ? 'completed' : 'upcoming';
    const savedOnly = parsed.savedOnly === true;
    const categories = Array.isArray(parsed.categories)
      ? parsed.categories.filter((value): value is TournamentCategoryFilter => (
          typeof value === 'string' && VALID_CATEGORIES.has(value)
        ))
      : [];

    return {
      version: 1,
      status,
      savedOnly,
      categories: Array.from(new Set(categories)),
    };
  } catch {
    return DEFAULT_TOURNAMENT_PREFERENCES;
  }
}

export function writeTournamentPreferences(
  preferences: Omit<TournamentPreferences, 'version'>,
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  storage.setItem(TOURNAMENT_FILTERS_STORAGE_KEY, JSON.stringify({
    version: 1,
    ...preferences,
  } satisfies TournamentPreferences));
  if (storage === localStorage) notifyUserDataChanged();
}
