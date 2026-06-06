import { useState } from 'react';
import type { AppTabId } from './navigation/tab-navigation';
import { type LeagueWithDivisions } from './player-shared';
import { useLeadersQuery, usePlayerCountQuery } from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import { SegmentedToggle } from './components/SegmentedToggle';

type DashboardTabId = Exclude<AppTabId, 'home'>;

interface HomeTabContentProps {
  allLeagues: LeagueWithDivisions[];
  selectedLeagueIds: string[];
  onOpenTab: (tabId: DashboardTabId) => void;
}

const LEADERS_LIMIT = 5;
const LEADERS_MIN_PLAYED = 3;

type PlayerListMode = 'top' | 'trending';

export function HomeTabContent({
  allLeagues,
  selectedLeagueIds,
  onOpenTab,
}: HomeTabContentProps) {
  const { navigateInTab } = useTabNavigation();
  const [listMode, setListMode] = useState<PlayerListMode>('top');
  const isAllLeagueScope = selectedLeagueIds.length === 0
    || (allLeagues.length > 0 && selectedLeagueIds.length === allLeagues.length);

  const leadersQuery = useLeadersQuery({
    mode: 'combined',
    leagueIds: isAllLeagueScope ? [] : selectedLeagueIds,
    limit: LEADERS_LIMIT,
    minPlayed: LEADERS_MIN_PLAYED,
    enabled: true,
  });
  const leaders = leadersQuery.data?.data ?? [];
  const isLeadersLoading = leadersQuery.isLoading;
  const leadersError = leadersQuery.error instanceof Error ? leadersQuery.error.message : null;

  const trendingQuery = useLeadersQuery({
    mode: 'most_played',
    leagueIds: isAllLeagueScope ? [] : selectedLeagueIds,
    limit: LEADERS_LIMIT,
    minPlayed: LEADERS_MIN_PLAYED,
    enabled: true,
  });
  const trending = trendingQuery.data?.data ?? [];
  const isTrendingLoading = trendingQuery.isLoading;

  const countQuery = usePlayerCountQuery();
  const isCountLoading = countQuery.isLoading;
  const playerCount = countQuery.data?.players ?? null;
  const matchCount = countQuery.data?.matches ?? null;
  const leagueCount = allLeagues.length;
  const divisionCount = allLeagues.reduce((s, l) => s + l.divisions.length, 0);

  const fmt = (v: number | null) => isCountLoading ? '...' : v !== null ? v.toLocaleString() : '–';

  const scopeLabel = isAllLeagueScope
    ? `All ${leagueCount} leagues`
    : `${selectedLeagueIds.length} of ${leagueCount} leagues`;

  const currentList = listMode === 'top' ? leaders : trending;
  const isListLoading = listMode === 'top' ? isLeadersLoading : isTrendingLoading;
  const listError = listMode === 'top' ? leadersError : null;

  const navItems = [
    {
      tabId: 'players' as DashboardTabId,
      title: 'Players',
      description: `Search across ${fmt(playerCount)} players`,
      iconClassName: 'fa fa-search',
    },
    {
      tabId: 'leagues' as DashboardTabId,
      title: 'Leagues',
      description: `${leagueCount} leagues, ${divisionCount} divisions`,
      iconClassName: 'fa fa-table-tennis',
    },
    {
      tabId: 'h2h' as DashboardTabId,
      title: 'Head to Head',
      description: 'Compare any two players',
      iconClassName: 'fa fa-code-compare',
    },
    {
      tabId: 'events' as DashboardTabId,
      title: 'Tournaments',
      description: 'Sport80 events & grand prix results',
      iconClassName: 'fa fa-trophy',
    },
  ];

  return (
    <>
      <div className="tt-home-summary">
        <p className="tt-home-summary-sub">{scopeLabel}</p>

        <div className="tt-home-summary-stats">
          <div className="tt-home-summary-stat">
            <span className="tt-home-summary-stat-value">{fmt(playerCount)}</span>
            <span className="tt-home-summary-stat-label">Players</span>
          </div>
          <div className="tt-home-summary-stat">
            <span className="tt-home-summary-stat-value">{leagueCount}</span>
            <span className="tt-home-summary-stat-label">Leagues</span>
          </div>
          <div className="tt-home-summary-stat">
            <span className="tt-home-summary-stat-value">{divisionCount}</span>
            <span className="tt-home-summary-stat-label">Divisions</span>
          </div>
          <div className="tt-home-summary-stat">
            <span className="tt-home-summary-stat-value">{fmt(matchCount)}</span>
            <span className="tt-home-summary-stat-label">Matches</span>
          </div>
        </div>
      </div>

      <div className="tt-home-leaders">
        <div className="tt-home-leaders-header">
          <SegmentedToggle
            ariaLabel="Choose leaderboard mode"
            value={listMode}
            onChange={setListMode}
            options={[
              { value: 'top', label: 'Top' },
              { value: 'trending', label: 'Trending' },
            ]}
          />
          <span className="tt-home-leaders-desc">
            {listMode === 'top' ? 'By win rate' : 'By activity'}
          </span>
        </div>

        {isListLoading ? (
          <p className="tt-home-leaders-loading">Loading...</p>
        ) : listError ? (
          <p className="tt-home-leaders-loading tt-home-leaders-error">Unable to load</p>
        ) : currentList.length === 0 ? (
          <p className="tt-home-leaders-loading">No data available for the selected leagues.</p>
        ) : (
          <div className="tt-home-leaders-list">
            {currentList.map((player: any, index: number) => (
              <a
                key={player.player_id}
                href="#"
                className="tt-home-leaders-row"
                onClick={(e) => {
                  e.preventDefault();
                  navigateInTab('players', `player/${player.player_id}`);
                }}
              >
                <span className="tt-home-leaders-rank">{index + 1}</span>
                <span className="tt-home-leaders-name">{player.player_name}</span>
                <span className="tt-home-leaders-stat">
                  {player.wins}W &middot; {player.losses}L &middot; {player.played}P
                </span>
                <span className="tt-home-leaders-rate">{Math.round(player.win_rate)}%</span>
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="tt-home-nav">
        {navItems.map((item) => (
          <a
            key={item.tabId}
            href="#"
            className="tt-home-nav-row"
            onClick={(e) => {
              e.preventDefault();
              onOpenTab(item.tabId);
            }}
          >
            <div className="tt-home-nav-icon">
              <i className={item.iconClassName} />
            </div>
            <div className="tt-home-nav-copy">
              <span className="tt-home-nav-title">{item.title}</span>
              <span className="tt-home-nav-desc">{item.description}</span>
            </div>
            <i className="fa fa-angle-right tt-home-nav-chevron" />
          </a>
        ))}
      </div>
    </>
  );
}
