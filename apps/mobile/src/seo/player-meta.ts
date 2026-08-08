import type { PlayerProfileOverview } from '../player-shared';
import { buildPlayerShareTarget } from '../share-target';

export type PlayerMeta = {
  title: string;
  description: string;
  canonicalUrl: string;
  imageUrl: string;
};

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function buildPlayerMeta(
  origin: string,
  profile: PlayerProfileOverview,
): PlayerMeta {
  const normalizedOrigin = trimTrailingSlashes(origin);
  const shareTarget = buildPlayerShareTarget(
    normalizedOrigin,
    profile.player_id,
    profile.player_name,
  );
  const winRate = profile.total > 0
    ? Math.round((profile.wins / profile.total) * 100)
    : 0;

  return {
    title: shareTarget.title,
    description: `${profile.player_name}: ${profile.total} matches, ${profile.wins} wins, ${winRate}% win rate.`,
    canonicalUrl: shareTarget.url,
    imageUrl: `${normalizedOrigin}/images/thumb-players.png`,
  };
}
