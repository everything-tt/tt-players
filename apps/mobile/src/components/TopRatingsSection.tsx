import { SkeletonList } from './Skeleton';
import { getQueryError } from '../player-shared';
import { ratingConfidenceLabel, useTopRatingsQuery } from '../rating-queries';
import {
  EmptyState,
  ErrorState,
  List,
  ListItem,
  Pill,
  RankBadge,
  SectionHeader,
} from '../ui/appkit';
import '../ratings-ui.css';

interface TopRatingsSectionProps {
  onOpenPlayer: (playerId: string) => void;
}

const TOP_RATINGS_LIMIT = 5;

export function TopRatingsSection({ onOpenPlayer }: TopRatingsSectionProps) {
  const ratingsQuery = useTopRatingsQuery(TOP_RATINGS_LIMIT);
  const ratings = ratingsQuery.data?.data ?? [];
  const error = getQueryError(ratingsQuery.error);

  return (
    <section className="tt-home-section" aria-labelledby="tt-top-ratings-title">
      <SectionHeader title="Top Rated Players" note="Opponent-adjusted ability" />
      {ratingsQuery.isLoading ? (
        <SkeletonList rows={TOP_RATINGS_LIMIT} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => ratingsQuery.refetch()} />
      ) : ratings.length === 0 ? (
        <EmptyState
          iconClassName="fa fa-ranking-star"
          title="Ratings are being calculated"
          message="Established player rankings will appear after the first rating backfill has progressed."
        />
      ) : (
        <List divider="hairline">
          {ratings.map((player, index) => (
            <ListItem
              key={player.player_id}
              leading={<RankBadge>{player.rank ?? index + 1}</RankBadge>}
              title={player.player_name}
              subtitle={`${ratingConfidenceLabel(player.confidence)} confidence · ${player.rated_matches} rated matches`}
              trailing={<Pill tone="accent">{Math.round(player.rating)}</Pill>}
              onClick={() => onOpenPlayer(player.player_id)}
            />
          ))}
        </List>
      )}
    </section>
  );
}
