export const HOME_VISIT_SNAPSHOT_STORAGE_KEY = 'tt_players_home_visit_snapshot_v1';

export type HomeVisitState = {
  scopeKey: string;
  rating: number | null;
  rank: number | null;
  recentResultIds: string[];
  topTeamId: string | null;
  topTeamName: string | null;
  topRiserPlayerId: string | null;
  topRiserName: string | null;
};

export type HomeVisitSnapshot = HomeVisitState & {
  seenAt: string;
};

export type HomeVisitChangeKind =
  | 'personal-rating'
  | 'new-results'
  | 'leader-change'
  | 'riser-change';

export type HomeVisitChange = {
  id: string;
  kind: HomeVisitChangeKind;
  title: string;
  subtitle: string;
  priority: number;
};

export type RankedHomeStory = {
  id: string;
  priority: number;
};

export type PersonalHomeStoryKind = 'personal-form' | 'recent-rating-high';

export type PersonalHomeStory = RankedHomeStory & {
  kind: PersonalHomeStoryKind;
  title: string;
  subtitle: string;
  trailing: string;
};

type RatingHistoryLike = {
  rating: number;
};

interface PersonalHomeStoryInput {
  recentResults: string[];
  currentRating: number | null;
  ratingHistory: RatingHistoryLike[];
}

export function buildHomeScopeKey(playerId: string | null | undefined, leagueIds: string[]): string {
  const playerKey = playerId || 'anonymous';
  const leagueKey = [...new Set(leagueIds)].sort().join(',') || 'all';
  return `${playerKey}::${leagueKey}`;
}

export function parseHomeVisitSnapshot(raw: string | null): HomeVisitSnapshot | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<HomeVisitSnapshot>;
    if (
      typeof parsed.seenAt !== 'string'
      || typeof parsed.scopeKey !== 'string'
      || !Array.isArray(parsed.recentResultIds)
    ) {
      return null;
    }

    return {
      seenAt: parsed.seenAt,
      scopeKey: parsed.scopeKey,
      rating: typeof parsed.rating === 'number' ? parsed.rating : null,
      rank: typeof parsed.rank === 'number' ? parsed.rank : null,
      recentResultIds: parsed.recentResultIds.filter((value): value is string => typeof value === 'string'),
      topTeamId: typeof parsed.topTeamId === 'string' ? parsed.topTeamId : null,
      topTeamName: typeof parsed.topTeamName === 'string' ? parsed.topTeamName : null,
      topRiserPlayerId: typeof parsed.topRiserPlayerId === 'string' ? parsed.topRiserPlayerId : null,
      topRiserName: typeof parsed.topRiserName === 'string' ? parsed.topRiserName : null,
    };
  } catch {
    return null;
  }
}

export function diffHomeVisit(
  previous: HomeVisitSnapshot | null,
  current: HomeVisitState,
): HomeVisitChange[] {
  if (!previous || previous.scopeKey !== current.scopeKey) return [];

  const changes: HomeVisitChange[] = [];

  const ratingDelta = previous.rating != null && current.rating != null
    ? Math.round(current.rating - previous.rating)
    : 0;
  const rankDelta = previous.rank != null && current.rank != null
    ? previous.rank - current.rank
    : 0;

  if (ratingDelta !== 0 || rankDelta !== 0) {
    const ratingPart = ratingDelta === 0
      ? 'Your rating is unchanged'
      : `Your rating moved ${ratingDelta > 0 ? '+' : ''}${ratingDelta}`;
    const rankPart = current.rank == null
      ? 'Global rank unavailable'
      : rankDelta === 0
        ? `Still #${current.rank} globally`
        : `${rankDelta > 0 ? 'up' : 'down'} ${Math.abs(rankDelta)} ${Math.abs(rankDelta) === 1 ? 'place' : 'places'} to #${current.rank}`;

    changes.push({
      id: 'personal-rating',
      kind: 'personal-rating',
      title: ratingPart,
      subtitle: rankPart,
      priority: 100,
    });
  }

  const previousResultIds = new Set(previous.recentResultIds);
  const newResultCount = current.recentResultIds.filter((id) => !previousResultIds.has(id)).length;
  if (newResultCount > 0) {
    changes.push({
      id: 'new-results',
      kind: 'new-results',
      title: `${newResultCount} new league ${newResultCount === 1 ? 'result' : 'results'}`,
      subtitle: 'Fresh scores landed in your selected leagues',
      priority: 90,
    });
  }

  if (
    previous.topTeamId
    && current.topTeamId
    && previous.topTeamId !== current.topTeamId
    && current.topTeamName
  ) {
    changes.push({
      id: 'leader-change',
      kind: 'leader-change',
      title: `New league leader: ${current.topTeamName}`,
      subtitle: previous.topTeamName
        ? `${current.topTeamName} has moved ahead of ${previous.topTeamName}`
        : 'The top of your selected leagues has changed',
      priority: 80,
    });
  }

  if (
    previous.topRiserPlayerId
    && current.topRiserPlayerId
    && previous.topRiserPlayerId !== current.topRiserPlayerId
    && current.topRiserName
  ) {
    changes.push({
      id: 'riser-change',
      kind: 'riser-change',
      title: `${current.topRiserName} is now the biggest mover`,
      subtitle: 'A new player leads the 6-week rating gains in your leagues',
      priority: 70,
    });
  }

  return changes.sort((left, right) => right.priority - left.priority);
}

export function buildPersonalHomeStories({
  recentResults,
  currentRating,
  ratingHistory,
}: PersonalHomeStoryInput): PersonalHomeStory[] {
  const stories: PersonalHomeStory[] = [];
  const normalizedResults = recentResults.filter((result) => result === 'W' || result === 'L');
  const latestFive = normalizedResults.slice(0, 5);
  const latestFiveWins = latestFive.filter((result) => result === 'W').length;

  let winningStreak = 0;
  for (const result of normalizedResults) {
    if (result !== 'W') break;
    winningStreak += 1;
  }

  if (winningStreak >= 3) {
    stories.push({
      id: 'personal-form',
      kind: 'personal-form',
      priority: 118,
      title: `You're on a ${winningStreak}-match winning streak`,
      subtitle: latestFive.length > 0
        ? `${latestFiveWins} wins in your last ${latestFive.length} singles`
        : 'Strong recent singles form',
      trailing: `${winningStreak} straight`,
    });
  } else if (latestFive.length === 5 && latestFiveWins >= 4) {
    stories.push({
      id: 'personal-form',
      kind: 'personal-form',
      priority: 108,
      title: `You've won ${latestFiveWins} of your last 5`,
      subtitle: 'Strong recent singles form',
      trailing: 'In form',
    });
  }

  if (currentRating != null && ratingHistory.length >= 2) {
    const ratings = ratingHistory
      .map((point) => point.rating)
      .filter((rating) => Number.isFinite(rating));

    if (ratings.length >= 2) {
      const recentHigh = Math.max(...ratings);
      const recentLow = Math.min(...ratings);
      const roundedCurrent = Math.round(currentRating);
      const gainFromLow = Math.round(currentRating - recentLow);
      const isAtRecentHigh = Math.abs(currentRating - recentHigh) < 0.5;

      if (isAtRecentHigh && gainFromLow >= 25) {
        stories.push({
          id: 'recent-rating-high',
          kind: 'recent-rating-high',
          priority: 102,
          title: "You're at a 3-month rating high",
          subtitle: `${roundedCurrent.toLocaleString('en-GB')} rating · up ${gainFromLow} from the low in this period`,
          trailing: '3m high',
        });
      }
    }
  }

  return stories.sort((left, right) => right.priority - left.priority);
}

export function rankHomeStories<T extends RankedHomeStory>(stories: T[], limit: number): T[] {
  return [...stories]
    .sort((left, right) => right.priority - left.priority)
    .slice(0, limit);
}
