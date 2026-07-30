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
  leagueIds: string[];
  onOpenPlayer: (playerId: string) => void;
}

const TOP_RATINGS_LIMIT = 5;

export function TopRatingsSection({ leagueIds, onOpenPlayer }: TopRatingsSectionProps) {
  const ratingsQuery = useTopRatingsQuery(leagueIds, TOP_RATINGS_LIMIT);
  const ratings = ratingsQuery.data?.data ?? [];
  const error = getQueryError(ratingsQuery.error);
  const scopeNote = leagueIds.length === 1 ? 'Selected league players' : `${leagueIds.length} selected leagues`;

  return (
    <section className="tt-home-section" aria-labelledby="tt-top-ratings-title">
      <SectionHeader title="Top Rated Players" note={scopeNote} />
      {ratingsQuery.isLoading ? (
        <SkeletonList rows={TOP_RATINGS_LIMIT} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => ratingsQuery.refetch()} />
      ) : ratings.length === 0 ? (
        <EmptyState
          iconClassName="fa fa-ranking-star"
          title="No established ratings yet"
          message="Established players from the selected leagues will appear after their rating history has been calculated."
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
