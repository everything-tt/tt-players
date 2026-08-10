import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { SkeletonList } from './components/Skeleton';
import { useTabNavigation } from './navigation/tab-navigation';
import { formatDateOrUnknown, getQueryError, groupTournamentMatches } from './player-shared';
import { usePlayerExtendedStatsQuery, usePlayerTournamentsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import { DetailHeader } from './components/DetailHeader';
import { AppPageContent, DesignList, EmptyState, ErrorState, IconCircle, ListItem, PageSection } from './ui/appkit';

export function PlayerTournamentsPage() {
  const { navigateInActiveTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();
  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const tournamentsQuery = usePlayerTournamentsQuery(playerId, Boolean(playerId));
  const stats = statsQuery.data ?? null;
  const tournaments = useMemo(() => groupTournamentMatches(tournamentsQuery.data?.data ?? []), [tournamentsQuery.data]);

  return (
    <TabShellPage>
      <DetailHeader title={statsQuery.isLoading ? 'Tournaments' : stats?.player_name ?? 'Tournaments'} backFallback={playerId ? `player/${playerId}` : ''} heading />
      <AppPageContent>
        <PageSection surface="flat" density="compact" title="Player Tournaments" note={`${tournaments.length} events`}>
          {tournamentsQuery.isLoading ? (
            <SkeletonList rows={5} />
          ) : getQueryError(tournamentsQuery.error) ? (
            <ErrorState message="Failed to load tournaments." onRetry={() => tournamentsQuery.refetch()} />
          ) : tournaments.length === 0 ? (
            <EmptyState iconClassName="fa fa-trophy" title="No tournaments" message="No tournament appearances found for this player." />
          ) : (
            <DesignList density="compact" divider="hairline" paginate={false}>
              {tournaments.map((event) => (
                <ListItem
                  key={event.event_id}
                  leading={<IconCircle iconClassName="fa fa-trophy" tone="accent" />}
                  title={event.event_name}
                  subtitle={`${formatDateOrUnknown(event.event_date)} · ${event.category ?? 'Tournament'} · ${event.wins}-${event.played - event.wins} from ${event.played}`}
                  onClick={() => navigateInActiveTab(`event/${event.event_id}`)}
                  hideChevron
                />
              ))}
            </DesignList>
          )}
        </PageSection>
      </AppPageContent>
    </TabShellPage>
  );
}
