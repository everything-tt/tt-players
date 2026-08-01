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
  limit: number;
  offset: number;
}

function sortedUnique(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean))).sort();
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
  limit,
  offset,
}: TournamentListPathOptions): string {
  const params = new URLSearchParams();
  params.set('status', status);
  const normalizedQuery = query.trim();
  if (normalizedQuery) params.set('q', normalizedQuery);
  const normalizedSavedIds = sortedUnique(savedIds);
  if (normalizedSavedIds.length > 0) params.set('saved_ids', normalizedSavedIds.join(','));
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
