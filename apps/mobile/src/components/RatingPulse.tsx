import { useMemo } from 'react';
import { useFavouritePlayers } from '../hooks/useFavouritePlayers';
import { useMyPlayer } from '../hooks/useMyPlayer';
import {
  type RatingCalculationMover,
  type RatingExceptionalResult,
  useRatingCalculationAuditQuery,
} from '../rating-calculation-audit-queries';
import {
  DesignList,
  IconCircle,
  ListItem,
  PageSection,
  Pill,
} from '../ui/appkit';

interface RatingPulseProps {
  onOpenPlayer: (playerId: string) => void;
}

function formatDelta(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded.toLocaleString('en-GB')}`;
}

function formatChance(probability: number): string {
  if (probability > 0 && probability < 0.01) return '<1% chance';
  return `${Math.round(probability * 100)}% chance`;
}

function isEstablishedMover(mover: RatingCalculationMover): boolean {
  // Avoid turning first-rating discovery from the 1500 seed into a public
  // "biggest climb" story. Established movers should already have moved away
  // from the seed and carry at least moderate uncertainty.
  return Math.abs(mover.rating_before - 1500) >= 1 && mover.rating_deviation_after <= 200;
}

function choosePreferred<T extends { player_id: string }>(
  items: T[],
  preferredIds: Set<string>,
): T | null {
  return items.find((item) => preferredIds.has(item.player_id)) ?? items[0] ?? null;
}

function contextPrefix(playerId: string, myPlayerId: string | null, favouriteIds: Set<string>): string | null {
  if (myPlayerId && playerId === myPlayerId) return 'You';
  if (favouriteIds.has(playerId)) return 'Following';
  return null;
}

function moverSubtitle(
  mover: RatingCalculationMover,
  prefix: string | null,
): string {
  const details = `${Math.round(mover.rating_before).toLocaleString('en-GB')} → ${Math.round(mover.rating_after).toLocaleString('en-GB')} · RD ${Math.round(mover.rating_deviation_after)}`;
  return prefix ? `${prefix} · ${details}` : details;
}

function resultSubtitle(
  result: RatingExceptionalResult,
  prefix: string | null,
): string {
  const details = `${formatChance(result.expected_win_probability)} · ${result.game_score ?? 'score unavailable'}`;
  return prefix ? `${prefix} · ${details}` : details;
}

export function RatingPulse({ onOpenPlayer }: RatingPulseProps) {
  const auditQuery = useRatingCalculationAuditQuery();
  const { player: myPlayer } = useMyPlayer();
  const { players: favouritePlayers } = useFavouritePlayers();

  const favouriteIds = useMemo(
    () => new Set(favouritePlayers.map((player) => player.id)),
    [favouritePlayers],
  );
  const preferredIds = useMemo(() => {
    const ids = new Set(favouriteIds);
    if (myPlayer?.id) ids.add(myPlayer.id);
    return ids;
  }, [favouriteIds, myPlayer?.id]);

  if (auditQuery.isLoading || auditQuery.isError || !auditQuery.data?.run) return null;

  const establishedMovers = auditQuery.data.movers.increases.filter(isEstablishedMover);
  const mover = choosePreferred(establishedMovers, preferredIds);
  const exceptionalResult = choosePreferred(auditQuery.data.exceptional_results, preferredIds);

  if (!mover && !exceptionalResult) return null;

  return (
    <PageSection
      surface="flat"
      density="compact"
      title="Rating pulse"
      meta={<Pill size="xs" tone="neutral">Latest</Pill>}
      description="A couple of interesting signals from the latest ranking update."
    >
      <DesignList density="compact" divider="hairline" paginate={false}>
        {mover ? (
          <ListItem
            leading={<IconCircle iconClassName="fa fa-arrow-trend-up" tone="success" />}
            title={mover.player_name}
            subtitle={moverSubtitle(
              mover,
              contextPrefix(mover.player_id, myPlayer?.id ?? null, favouriteIds),
            )}
            trailing={<Pill tone="success">{formatDelta(mover.change)}</Pill>}
            onClick={() => onOpenPlayer(mover.player_id)}
          />
        ) : null}
        {exceptionalResult ? (
          <ListItem
            leading={<IconCircle iconClassName="fa fa-bolt" tone="accent" />}
            title={`${exceptionalResult.player_name} beat ${exceptionalResult.opponent_name}`}
            subtitle={resultSubtitle(
              exceptionalResult,
              contextPrefix(exceptionalResult.player_id, myPlayer?.id ?? null, favouriteIds),
            )}
            trailing={<Pill tone="success">{formatDelta(exceptionalResult.attributed_rating_delta)}</Pill>}
            onClick={() => onOpenPlayer(exceptionalResult.player_id)}
          />
        ) : null}
      </DesignList>
    </PageSection>
  );
}
