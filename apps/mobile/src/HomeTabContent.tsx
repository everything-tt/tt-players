import { useState } from 'react';
import type { AppTabId } from './navigation/tab-navigation';
import { type LeagueWithDivisions, TAB_METADATA, formatNumber, getQueryError } from './player-shared';
import { useLeagueCollectionDashboardQuery, useLeadersQuery, usePlayerCountQuery } from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import {
  EmptyState,
  ErrorState,
  List,
  ListItem,
  Pill,
  RankBadge,
  SectionHeader,
  SegmentedToggle,
} from './ui/appkit';
import { SkeletonList } from './components/Skeleton';
import { TopRatingsSection } from './components/TopRatingsSection';

interface HomeTabContentProps {
  allLeagues: LeagueWithDivisions[];
  hasCompletedLeagueOnboarding: boolean;
  selectedLeagueIds: string[];
  onOpenLeagueSelector: () => void;
  onOpenTab: (tabId: DashboardTabId) => void;
}

const WATCH_LIST_LIMIT = 5;
const RECENT_RESULTS_LIMIT = 5;
const LEADERS_MIN_PLAYED = 3;

type DashboardTabId = Exclude<AppTabId, 'home'>;
type WatchListMode = 'top' | 'active' | 'form' | 'improving' | 'new_faces' | 'teams';

const WATCH_LIST_OPTIONS: Array<{ value: WatchListMode; label: string }> = [
  { value: 'top', label: 'Top' },
  { value: 'active', label: 'Active' },
  { value: 'form', label: 'Form' },
  { value: 'improving', label: 'Improving' },
  { value: 'new_faces', label: 'New' },
  { value: 'teams', label: 'Teams' },
];

function formatDate(value: string | null): string {
  if (!value) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' })
    .format(new Date(`${value}T12:00:00`));
}

function formatFixtureTeams(home: string | null, away: string | null): string {
  return `${home ?? 'Home'} vs ${away ?? 'Away'}`;
}

export function HomeTabContent({
  allLeagues,
  hasCompletedLeagueOnboarding,
  selectedLeagueIds,
  onOpenLeagueSelector,
  onOpenTab,
}: HomeTabContentProps) {
  const { navigateInTab } = useTabNavigation();
  const [watchListMode, setWatchListMode] = useState<WatchListMode>('top');
  const hasLeagueScope = hasCompletedLeagueOnboarding && selectedLeagueIds.length > 0;
  const isAllLeagueScope = hasLeagueScope
    && allLeagues.length > 0
    && selectedLeagueIds.length === allLeagues.length;
  const scopedLeagueIds = isAllLeagueScope ? [] : selectedLeagueIds;

  const dashboardQuery = useLeagueCollectionDashboardQuery(scopedLeagueIds, hasLeagueScope);
  const dashboard = dashboardQuery.data ?? null;

  const leadersQuery = useLeadersQuery({
    mode:
      watchListMode === 'active' ? 'most_played' :
      watchListMode === 'form' ? 'form' :
      watchListMode === 'improving' ? 'improving' :
      watchListMode === 'new_faces' ? 'new_faces' :
      'combined',
    leagueIds: scopedLeagueIds,
    limit: WATCH_LIST_LIMIT,
    minPlayed: watchListMode === 'form' ? 5 : watchListMode === 'new_faces' ? 1 : LEADERS_MIN_PLAYED,
    enabled: hasLeagueScope && watchListMode !== 'teams',
  });
  const currentList = leadersQuery.data?.data ?? [];
  const isListLoading = leadersQuery.isLoading;
  const leadersError = leadersQuery.error;

  const countQuery = usePlayerCountQuery();
  const isCountLoading = countQuery.isLoading;
  const playerCount = countQuery.data?.players ?? null;
  const matchCount = countQuery.data?.matches ?? null;
  const leagueCount = allLeagues.length;
  const divisionCount = allLeagues.reduce((sum, league) => sum + league.divisions.length, 0);

  const formatCount = (value: number | null | undefined, loading = false) => loading ? '…' : formatNumber(value);

  const scopeLabel = isAllLeagueScope
    ? `All ${leagueCount} leagues`
    : !hasLeagueScope
      ? 'Choose your leagues'
      : `${selectedLeagueIds.length} of ${leagueCount} leagues`;
  const summaryLabel = hasLeagueScope
    ? `${scopeLabel} · ${formatCount(playerCount, isCountLoading)} indexed players`
    : `${formatCount(playerCount, isCountLoading)} indexed players · ${formatCount(matchCount, isCountLoading)} recorded matches`;
  const summaryLoading = hasLeagueScope && dashboardQuery.isLoading;
  const summaryStats = hasLeagueScope
    ? [
        { label: 'Leagues', value: dashboard?.totals.leagues ?? (isAllLeagueScope ? leagueCount : selectedLeagueIds.length) },
        { label: 'Divisions', value: dashboard?.totals.divisions ?? null },
        { label: 'Teams', value: dashboard?.totals.teams ?? null },
        { label: 'Matches', value: dashboard?.totals.matches_played ?? null },
      ]
    : [
        { label: 'Players', value: playerCount },
        { label: 'Leagues', value: leagueCount },
        { label: 'Divisions', value: divisionCount },
        { label: 'Matches', value: matchCount },
      ];
  const recentResults = dashboard?.recent_results.slice(0, RECENT_RESULTS_LIMIT) ?? [];
  const dashboardError = getQueryError(dashboardQuery.error);
  const navItems: DashboardTabId[] = ['players', 'leagues', 'h2h', 'events'];
  const watchListNote =
    watchListMode === 'top' ? 'Season strength' :
    watchListMode === 'active' ? 'Most singles played' :
    watchListMode === 'form' ? 'Latest 10 singles' :
    watchListMode === 'improving' ? 'Latest 5 vs previous 5' :
    watchListMode === 'new_faces' ? 'Newest season debuts' :
    'By team win rate';
  const playerListEmptyMessage =
    watchListMode === 'form' ? 'No players have five recent singles in the selected leagues.' :
    watchListMode === 'improving' ? 'No improving players have two complete five-match windows yet.' :
    watchListMode === 'new_faces' ? 'No active-season player appearances are available in the selected leagues.' :
    'Not enough singles have been played in the selected leagues.';

  return (
    <>
      <section className="tt-home-summary" aria-labelledby="tt-home-summary-title">
        <div className="tt-home-summary-header">
          <div>
            <p className="tt-home-summary-kicker">Active season</p>
            <h2 id="tt-home-summary-title" className="tt-home-summary-title">Your leagues. Your game.</h2>
            <p className="tt-home-summary-sub">{summaryLabel}</p>
          </div>
          <button type="button" className="tt-home-summary-action" onClick={onOpenLeagueSelector}>
            {hasLeagueScope ? 'Edit' : 'Select'}
          </button>
        </div>

        <div className="tt-home-summary-stats">
          {summaryStats.map((stat) => (
            <div key={stat.label} className="tt-home-summary-stat">
              <span className="tt-home-summary-stat-value">
                {formatCount(stat.value, summaryLoading || (!hasLeagueScope && isCountLoading))}
              </span>
              <span className="tt-home-summary-stat-label">{stat.label}</span>
            </div>
          ))}
        </div>
      </section>

      <TopRatingsSection onOpenPlayer={(playerId) => navigateInTab('players', `player/${playerId}`)} />

      {!hasLeagueScope ? (
        <>
          <section className="tt-home-section">
            <div className="tt-home-onboarding">
              <div className="tt-home-onboarding-icon">
                <i className="fa fa-filter" />
              </div>
              <h2 className="tt-home-onboarding-title">Choose leagues first</h2>
              <p className="tt-home-onboarding-copy">
                Pick the leagues you follow, then Home will show active-season results and players for that scope.
              </p>
              <button type="button" className="tt-home-onboarding-button" onClick={onOpenLeagueSelector}>
                Select leagues
              </button>
            </div>
          </section>

          <nav className="tt-home-nav" aria-label="Explore TT Players">
            {navItems.map((tabId) => {
              const meta = TAB_METADATA[tabId];
              const description =
                tabId === 'players' ? `Search across ${formatCount(playerCount, isCountLoading)} players` :
                tabId === 'leagues' ? `${leagueCount} leagues, ${divisionCount} divisions` :
                meta.description;

              return (
                <button
                  key={tabId}
                  type="button"
                  className="tt-home-nav-row"
                  onClick={() => onOpenTab(tabId)}
                >
                  <div className="tt-home-nav-icon">
                    <i className={meta.icon} />
                  </div>
                  <div className="tt-home-nav-copy">
                    <span className="tt-home-nav-title">{meta.label}</span>
                    <span className="tt-home-nav-desc">{description}</span>
                  </div>
                  <i className="fa fa-angle-right tt-home-nav-chevron" />
                </button>
              );
            })}
          </nav>
        </>
      ) : (
        <>
          <section className="tt-home-section">
            <SectionHeader title="Latest results" note={scopeLabel} />
            {dashboardQuery.isLoading ? (
              <SkeletonList rows={RECENT_RESULTS_LIMIT} />
            ) : dashboardError ? (
              <ErrorState message={dashboardError} />
            ) : recentResults.length > 0 ? (
              <List divider="hairline">
                {recentResults.map((result) => (
                  <ListItem
                    key={result.fixture_id}
                    leading={<span className="tt-score-badge">{result.home_score}-{result.away_score}</span>}
                    title={formatFixtureTeams(result.home_team_name, result.away_team_name)}
                    subtitle={`${result.league_name} · ${result.division_name} · ${formatDate(result.date_played)}`}
                    onClick={() => navigateInTab('leagues', `fixture/${result.fixture_id}`)}
                  />
                ))}
              </List>
            ) : (
              <EmptyState iconClassName="fa fa-table-tennis" title="No results yet" message="Completed matches from the selected leagues will appear here." />
            )}
          </section>

          <section className="tt-home-section">
            <SectionHeader
              title={watchListMode === 'teams' ? 'Teams to watch' : 'Players to watch'}
              note={watchListNote}
            />
            <div className="tt-home-leaders-header tt-home-watchlist-tabs">
              <SegmentedToggle
                ariaLabel="Choose watchlist mode"
                value={watchListMode}
                onChange={setWatchListMode}
                options={WATCH_LIST_OPTIONS}
              />
            </div>
            <div aria-live="polite">
              {watchListMode === 'teams' ? (
                dashboardQuery.isLoading ? (
                  <SkeletonList rows={WATCH_LIST_LIMIT} />
                ) : dashboard && dashboard.top_teams.length > 0 ? (
                  <List divider="hairline">
                    {dashboard.top_teams.slice(0, WATCH_LIST_LIMIT).map((team, index) => (
                      <ListItem
                        key={team.team_id}
                        leading={<RankBadge>{index + 1}</RankBadge>}
                        title={team.team_name}
                        subtitle={`${team.league_name} · ${team.division_name} · ${team.won}W ${team.drawn}D ${team.lost}L`}
                        trailing={<Pill tone="accent">{Math.round(team.win_rate)}%</Pill>}
                        onClick={() => navigateInTab('leagues', `team/${team.team_id}`)}
                      />
                    ))}
                  </List>
                ) : (
                  <EmptyState iconClassName="fa fa-shield-alt" title="No team performance" message="Team standings are not available in the selected scope." />
                )
              ) : isListLoading ? (
                <SkeletonList rows={WATCH_LIST_LIMIT} />
              ) : leadersError ? (
                <ErrorState message={getQueryError(leadersError) || 'Please try again later.'} />
              ) : currentList.length === 0 ? (
                <EmptyState iconClassName="fa fa-chart-line" title="No player data yet" message={playerListEmptyMessage} />
              ) : (
                <List divider="hairline">
                  {currentList.map((player, index) => (
                    <ListItem
                      key={player.player_id}
                      leading={<RankBadge>{index + 1}</RankBadge>}
                      title={player.player_name}
                      subtitle={
                        watchListMode === 'form' ? `${player.wins}W · ${player.losses}L · Last ${player.played}` :
                        watchListMode === 'improving' ? `${player.wins}W · ${player.losses}L · Latest 5` :
                        `${player.wins}W · ${player.losses}L · ${player.played} played`
                      }
                      trailing={
                        watchListMode === 'improving'
                          ? <Pill tone="accent">+{Math.round(player.score ?? 0)} pts</Pill>
                          : watchListMode === 'new_faces'
                            ? <Pill>{formatDate(player.first_match_date)}</Pill>
                            : <Pill tone="accent">{Math.round(player.win_rate)}%</Pill>
                      }
                      onClick={() => navigateInTab('players', `player/${player.player_id}`)}
                    />
                  ))}
                </List>
              )}
            </div>
          </section>
        </>
      )}
    </>
  );
}
