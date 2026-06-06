import { useMemo, type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { useTabNavigation } from './navigation/tab-navigation';
import { formatDate } from './player-shared';
import { usePlayerExtendedStatsQuery, usePlayerTournamentsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import {
  AppButtonLink,
  AppHeader,
  AppHeaderSpacer,
  AppListGroup,
  AppListItem,
  AppPageContent,
} from './ui/appkit';

export function PlayerTournamentsPage() {
  const { goBackInActiveTab, navigateInActiveTab, switchTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();

  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const tournamentsQuery = usePlayerTournamentsQuery(playerId, Boolean(playerId));
  const stats = statsQuery.data ?? null;
  const statsLoading = statsQuery.isLoading;
  const tournamentsLoading = tournamentsQuery.isLoading;
  const tournamentsError = tournamentsQuery.error instanceof Error ? tournamentsQuery.error.message : null;

  const tournaments = useMemo(() => {
    const events = new Map<string, {
      event_id: string;
      event_name: string;
      event_date: string | null;
      category: string | null;
      played: number;
      wins: number;
    }>();

    for (const match of tournamentsQuery.data?.data ?? []) {
      const existing = events.get(match.event_id) ?? {
        event_id: match.event_id,
        event_name: match.event_name,
        event_date: match.event_date,
        category: match.category,
        played: 0,
        wins: 0,
      };
      const isWin = (match.winner_side === 'home' && match.player_side === 'home') ||
        (match.winner_side === 'away' && match.player_side === 'away');
      existing.played += 1;
      existing.wins += isWin ? 1 : 0;
      events.set(match.event_id, existing);
    }

    return Array.from(events.values());
  }, [tournamentsQuery.data]);

  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    goBackInActiveTab(playerId ? `player/${playerId}` : '');
  };

  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    switchTab('home', 'root');
  };

  return (
    <TabShellPage>
      <AppHeader
        title={statsLoading ? 'Tournaments' : stats?.player_name ?? 'Tournaments'}
        onTitleClick={goHome}
        leftAction={{ iconClassName: 'fas fa-chevron-left', onClick: goBack, position: 1, ariaLabel: 'Back' }}
        rightAction={{ iconClassName: 'fas fa-home', onClick: goHome, position: 4, ariaLabel: 'Home' }}
      />
      <AppHeaderSpacer />

      <AppPageContent>
        <section className="tt-player-section" aria-labelledby="tt-player-tournaments-full-title">
          <div className="tt-player-section-header">
            <h2 id="tt-player-tournaments-full-title" className="tt-player-section-title">Player Tournaments</h2>
            <span className="tt-player-section-note">{tournaments.length} events</span>
          </div>
          {tournamentsLoading ? (
            <p className="tt-player-section-state mb-0"><i className="fa fa-spinner fa-spin me-2" />Loading tournaments...</p>
          ) : tournamentsError ? (
            <div>
              <p className="tt-player-section-state tt-player-section-error mb-3">Failed to load tournaments.</p>
              <AppButtonLink onClick={goBack}>Back to Player</AppButtonLink>
            </div>
          ) : tournaments.length === 0 ? (
            <p className="tt-player-section-state mb-0">No tournament appearances found for this player.</p>
          ) : (
            <AppListGroup size="large" className="tt-tournament-list tt-player-list">
              {tournaments.map((event, index) => {
                const dateStr = event.event_date ? formatDate(event.event_date) : 'Unknown Date';
                const lossCount = event.played - event.wins;
                return (
                  <AppListItem
                    key={event.event_id}
                    iconClassName="fa fa-trophy rounded-xl tt-icon-tournament"
                    title={event.event_name}
                    subtitle={`${dateStr} · ${event.category ?? 'Tournament'} · ${event.wins}-${lossCount} from ${event.played}`}
                    onClick={(e) => {
                      e.preventDefault();
                      navigateInActiveTab(`event/${event.event_id}`);
                    }}
                    borderless={index === tournaments.length - 1}
                  />
                );
              })}
            </AppListGroup>
          )}
        </section>
      </AppPageContent>
    </TabShellPage>
  );
}
