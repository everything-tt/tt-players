import type {
  PlayerMomentum,
  PlayerRivalsResponse,
  PlayerRivalTab,
  PlayerRivalTabItem,
} from './player-insights-types';

export function buildInsightTakeaway(
  momentum: PlayerMomentum,
  bestSeasonWinRate: number | null,
): string {
  if (momentum === 'new') {
    return 'More recent matches are needed to establish a form trend.';
  }

  if (momentum === 'hot') {
    return bestSeasonWinRate === null
      ? 'Recent results show strong form.'
      : `Hot recent form, with an ${bestSeasonWinRate}% win rate in the best season.`;
  }

  if (momentum === 'cold') {
    return 'Recent results are below the longer-term level.';
  }

  return bestSeasonWinRate === null
    ? 'Recent form is steady across the latest matches.'
    : `Recent form is steady, with a best-season win rate of ${bestSeasonWinRate}%.`;
}

export function formatInsightMonth(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(`${value}-01T12:00:00Z`);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

export function formatMilestoneHits(hits: number[]): string {
  return hits.length === 0 ? 'None yet' : hits.join(' · ');
}

export function getRivalTabItems(
  rivals: PlayerRivalsResponse,
  tab: PlayerRivalTab,
): PlayerRivalTabItem[] {
  return rivals[tab];
}

export function momentumLabel(momentum: PlayerMomentum): string {
  switch (momentum) {
    case 'hot':
      return 'Hot';
    case 'steady':
      return 'Steady';
    case 'cold':
      return 'Cold';
    default:
      return 'New';
  }
}

export function momentumIcon(momentum: PlayerMomentum): string {
  switch (momentum) {
    case 'hot':
      return 'fa fa-fire';
    case 'steady':
      return 'fa fa-equals';
    case 'cold':
      return 'fa fa-snowflake';
    default:
      return 'fa fa-seedling';
  }
}
