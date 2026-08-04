import { useEffect, useState } from 'react';
import { SkeletonList } from './Skeleton';
import { getQueryError } from '../player-shared';
import {
  ratingConfidenceLabel,
  useTopRatingsQuery,
  useTopSiteRatingsQuery,
} from '../rating-queries';
import { useTabNavigation } from '../navigation/tab-navigation';
import {
  EmptyState,
  ErrorState,
  FilterBar,
  List,
  ListItem,
  Pill,
  RankBadge,
  SectionHeader,
  SegmentedToggle,
} from '../ui/appkit';
import '../ratings-ui.css';

interface TopRatingsSectionProps {
  leagueIds: string[];
  onOpenPlayer: (playerId: string) => void;
}

type RatingsScope = 'site' | 'selected';

const TOP_RATINGS_LIMIT = 5;

export function TopRatingsSection({ leagueIds, onOpenPlayer }: TopRatingsSectionProps) {
  const { navigateInTab } = useTabNavigation();
  const hasSelectedLeagues = leagueIds.length > 0;
  const [scope, setScope] = useState<RatingsScope>(() => hasSelectedLeagues ? 'selected' : 'site');

  useEffect(() => {
    if (!hasSelectedLeagues && scope === 'selected') setScope('site');
  }, [hasSelectedLeagues, scope]);

  const isSelectedScope = hasSelectedLeagues && scope === 'selected';
  const siteRatingsQuery = useTopSiteRatingsQuery(TOP_RATINGS_LIMIT, !isSelectedScope);
  const selectedRatingsQuery = useTopRatingsQuery(leagueIds, TOP_RATINGS_LIMIT, isSelectedScope);
  const ratings = isSelectedScope
    ? selectedRatingsQuery.data?.data ?? []
    : siteRatingsQuery.data?.data ?? [];
  const isLoading = isSelectedScope ? selectedRatingsQuery.isLoading : siteRatingsQuery.isLoading;
  const queryError = isSelectedScope ? selectedRatingsQuery.error : siteRatingsQuery.error;
  const refetch = isSelectedScope ? selectedRatingsQuery.refetch : siteRatingsQuery.refetch;
  const error = getQueryError(queryError);
  const scopeNote = isSelectedScope
    ? leagueIds.length === 1
      ? 'From your selected league'
      : `From ${leagueIds.length} selected leagues`
    : 'Across all TT Players';

  return (
    <section className="tt-home-section" aria-labelledby="tt-top-ratings-title">
      <SectionHeader
        title={<span id="tt-top-ratings-title">Top Rated Players</span>}
        note={scopeNote}
        action={(
          <div className="tt-top-ratings-heading-actions">
            <button
              type="button"
              onClick={() => navigateInTab('home', `ratings?scope=${isSelectedScope ? 'selected' : 'site'}`)}
            >
              View all
              <i className="fa fa-angle-right" aria-hidden="true" />
            </button>
          </div>
        )}
      />

      {hasSelectedLeagues ? (
        <FilterBar ariaLabel="Rating leaderboard scope">
          <SegmentedToggle
            ariaLabel="Choose rating leaderboard scope"
            value={scope}
            onChange={setScope}
            options={[
              { value: 'site', label: 'All site' },
              { value: 'selected', label: 'Selected leagues' },
            ]}
          />
        </FilterBar>
      ) : null}

      {isLoading ? (
        <SkeletonList rows={TOP_RATINGS_LIMIT} />
      ) : error ? (
        <ErrorState message={error} onRetry={() => void refetch()} />
      ) : ratings.length === 0 ? (
        <EmptyState
          iconClassName="fa fa-ranking-star"
          title="No established ratings yet"
          message={isSelectedScope
            ? 'Established players from the selected leagues will appear after their rating history has been calculated.'
            : 'Established players will appear after their site-wide rating history has been calculated.'}
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
