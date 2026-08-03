import type { TournamentCategoryFilter } from './tournament-category-filter';

export interface PlayerSearchPathOptions {
  query: string;
  leagueIds: string[];
  savedIds: string[];
  limit: number;
  offset: number;
  allLeaguesCount?: number;
}

export interface TournamentListPathOptions {
  status: 'upcoming' | 'completed';
  query: string;
  savedIds: string[];
  categories: TournamentCategoryFilter[];
  limit: number;
  offset: number;
}

export interface PagedResponse<T> {
  data: T[];
  total?: number | string;
  limit?: number | string;
  offset?: number | string;
  has_more?: boolean;
}

export interface NormalizedPage<T> {
  data: T[];
  total: number | null;
  hasMore: boolean;
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
}

function finiteNumber(value: number | string | undefined): number | null {
  if (value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

/**
 * Accept both the current paginated API envelope and the older deployed search
 * response, which only contains `data`. Legacy responses cannot safely request
 * another page because they ignore limit/offset, so they are treated as a
 * complete snapshot rather than creating an infinite duplicate-fetch loop.
 */
export function normalizePagedResponse<T>(
  response: PagedResponse<T>,
  requestedOffset: number,
): NormalizedPage<T> {
  const total = finiteNumber(response.total);
  const hasMore = typeof response.has_more === 'boolean'
    ? response.has_more
    : total !== null
      ? requestedOffset + response.data.length < total
      : false;

  return {
    data: response.data,
    total,
    hasMore,
  };
}

export function buildPlayerSearchPath({
  query,
  leagueIds,
  savedIds,
  limit,
  offset,
  allLeaguesCount,
}: PlayerSearchPathOptions): string {
  const params = new URLSearchParams();
  const normalizedQuery = query.trim();
  if (normalizedQuery) params.set('q', normalizedQuery);

  const normalizedLeagueIds = sortedUnique(leagueIds);
  const shouldIncludeLeagueIds = allLeaguesCount === undefined
    ? normalizedLeagueIds.length > 0
    : normalizedLeagueIds.length > 0 && normalizedLeagueIds.length < allLeaguesCount;
  if (shouldIncludeLeagueIds) params.set('league_ids', normalizedLeagueIds.join(','));

  const normalizedSavedIds = sortedUnique(savedIds);
  if (normalizedSavedIds.length > 0) params.set('saved_ids', normalizedSavedIds.join(','));
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return `/players/search?${params.toString()}`;
}

export function buildTournamentListPath({
  status,
  query,
  savedIds,
  categories,
  limit,
  offset,
}: TournamentListPathOptions): string {
  const params = new URLSearchParams();
  params.set('status', status);
  const normalizedQuery = query.trim();
  if (normalizedQuery) params.set('q', normalizedQuery);
  const normalizedSavedIds = sortedUnique(savedIds);
  if (normalizedSavedIds.length > 0) params.set('saved_ids', normalizedSavedIds.join(','));
  const normalizedCategories = sortedUnique(categories);
  if (normalizedCategories.length > 0) params.set('categories', normalizedCategories.join(','));
  params.set('limit', String(limit));
  params.set('offset', String(offset));
  return `/events?${params.toString()}`;
}

export function mergePageById<T extends { id: string }>(
  previous: T[],
  incoming: T[],
  reset: boolean,
): T[] {
  if (reset) return incoming;
  const existingIds = new Set(previous.map((item) => item.id));
  return [...previous, ...incoming.filter((item) => !existingIds.has(item.id))];
}
