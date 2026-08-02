export type PlayersTabMode = 'following' | 'short-query' | 'search';

export function getPlayersTabMode(query: string, minSearchLength = 3): PlayersTabMode {
  const normalizedQuery = query.trim();
  if (normalizedQuery.length === 0) return 'following';
  return normalizedQuery.length < minSearchLength ? 'short-query' : 'search';
}

export function getFollowedPlayerIds(
  players: Array<{ id: string }>,
  myPlayerId?: string | null,
): string[] {
  return players
    .filter((player) => player.id !== myPlayerId)
    .map((player) => player.id);
}
