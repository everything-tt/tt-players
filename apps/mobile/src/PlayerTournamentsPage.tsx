import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { SkeletonList } from './components/Skeleton';
import { useTabNavigation } from './navigation/tab-navigation';
import { formatDateOrUnknown, getQueryError, groupTournamentMatches } from './player-shared';
import { usePlayerExtendedStatsQuery, usePlayerTournamentsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import { DetailHeader } from './components/DetailHeader';
import {
  List,
  ListItem,
  IconCircle,
  EmptyState,
  ErrorState,
  SectionHeader,
} from './ui/appkit';

export function PlayerTournamentsPage() {
  const { navigateInActiveTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();

  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const tournamentsQuery = usePlayerTournamentsQuery(playerId, Boolean(playerId));
  const stats = statsQuery.data ?? null;
  const statsLoading = statsQuery.isLoading;
  const tournamentsLoading = tournamentsQuery.isLoading;
  const tournamentsError = getQueryError(tournamentsQuery.error);

  const tournaments = useMemo(
    () => groupTournamentMatches(tournamentsQuery.data?.data ?? []),
    [tournamentsQuery.data],
  );

  return (
    <TabShellPage>
      <DetailHeader title={statsLoading ? 'Tournaments' : stats?.player_name ?? 'Tournaments'} backFallback={playerId ? `player/${playerId}` : ''} />
      <div className="page-content app-shell-content">
        <section className="tt-player-section" aria-labelledby="tt-player-tournaments-full-title">
          <SectionHeader title="Player Tournaments" note={`${tournaments.length} events`} />
          {tournamentsLoading ? (
            <SkeletonList rows={5} />
          ) : tournamentsError ? (
            <ErrorState message="Failed to load tournaments." onRetry={() => tournamentsQuery.refetch()} />
          ) : tournaments.length === 0 ? (
            <EmptyState iconClassName="fa fa-trophy" title="No tournaments" message="No tournament appearances found for this player." />
          ) : (
            <List divider="hairline">
              {tournaments.map((event) => {
                const lossCount = event.played - event.wins;
                return (
                  <ListItem
                    key={event.event_id}
                    leading={<IconCircle iconClassName="fa fa-trophy" tone="accent" />}
                    title={event.event_name}
                    subtitle={`${formatDateOrUnknown(event.event_date)} · ${event.category ?? 'Tournament'} · ${event.wins}-${lossCount} from ${event.played}`}
                    onClick={() => navigateInActiveTab(`event/${event.event_id}`)}
                    hideChevron
                  />
                );
              })}
            </List>
          )}
        </section>
      </div>
    </TabShellPage>
  );
}
