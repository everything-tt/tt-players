import { useState } from 'react';
import type { AppTabId } from './navigation/tab-navigation';
import { type LeagueWithDivisions, TAB_METADATA, formatNumber } from './player-shared';
import { useLeadersQuery, usePlayerCountQuery } from './queries';
import { useTabNavigation } from './navigation/tab-navigation';
import { SegmentedToggle, EmptyState, List, ListItem, RankBadge, Pill } from './ui/appkit';

type DashboardTabId = Exclude<AppTabId, 'home'>;

interface HomeTabContentProps {
  allLeagues: LeagueWithDivisions[];
  hasCompletedLeagueOnboarding: boolean;
  selectedLeagueIds: string[];
  onOpenLeagueSelector: () => void;
  onOpenTab: (tabId: DashboardTabId) => void;
}

const LEADERS_LIMIT = 5;
const LEADERS_MIN_PLAYED = 3;

type PlayerListMode = 'top' | 'trending';

export function HomeTabContent({
  allLeagues,
  hasCompletedLeagueOnboarding,
  selectedLeagueIds,
  onOpenLeagueSelector,
  onOpenTab,
}: HomeTabContentProps) {
  const { navigateInTab } = useTabNavigation();
  const [listMode, setListMode] = useState<PlayerListMode>('top');
  const hasLeagueScope = hasCompletedLeagueOnboarding && selectedLeagueIds.length > 0;
  const isAllLeagueScope = hasLeagueScope
    && allLeagues.length > 0
    && selectedLeagueIds.length === allLeagues.length;

  // Only the visible mode loads (replaces the previous double-fire).
  const leadersQuery = useLeadersQuery({
    mode: listMode === 'top' ? 'combined' : 'most_played',
    leagueIds: isAllLeagueScope ? [] : selectedLeagueIds,
    limit: LEADERS_LIMIT,
    minPlayed: LEADERS_MIN_PLAYED,
    enabled: hasLeagueScope,
  });
  const currentList = leadersQuery.data?.data ?? [];
  const isListLoading = leadersQuery.isLoading;
  const leadersError = leadersQuery.error;

  const countQuery = usePlayerCountQuery();
  const isCountLoading = countQuery.isLoading;
  const playerCount = countQuery.data?.players ?? null;
  const matchCount = countQuery.data?.matches ?? null;
  const leagueCount = allLeagues.length;
  const divisionCount = allLeagues.reduce((s, l) => s + l.divisions.length, 0);

  const fmt = (v: number | null) => isCountLoading ? '…' : formatNumber(v);

  const scopeLabel = isAllLeagueScope
    ? `All ${leagueCount} leagues`
    : !hasLeagueScope
      ? 'Choose your leagues'
      : `${selectedLeagueIds.length} of ${leagueCount} leagues`;

  // Drive nav cards from the single TAB_METADATA source (no more 3 duplicate lists).
  const navItems: DashboardTabId[] = ['players', 'leagues', 'h2h', 'events'];

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
        {!hasLeagueScope ? (
          <div className="tt-home-onboarding">
            <div className="tt-home-onboarding-icon">
              <i className="fa fa-filter" />
            </div>
            <h2 className="tt-home-onboarding-title">Choose leagues first</h2>
            <p className="tt-home-onboarding-copy">
              Pick the leagues you follow, then TT Players will show top and trending players for that scope.
            </p>
            <button type="button" className="tt-home-onboarding-button" onClick={onOpenLeagueSelector}>
              Select leagues
            </button>
          </div>
        ) : (
          <>
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

            <div aria-live="polite">
              {isListLoading ? (
                <EmptyState iconClassName="fa fa-spinner fa-spin" title="Loading…" message="Fetching leaders." />
              ) : leadersError ? (
                <EmptyState iconClassName="fa fa-exclamation-triangle" title="Couldn’t load leaders" message="Please try again later." />
              ) : currentList.length === 0 ? (
                <EmptyState iconClassName="fa fa-chart-line" title="No data yet" message="Not enough matches played in the selected leagues." />
              ) : (
                <List divider="hairline">
                  {currentList.map((player: any, index: number) => (
                    <ListItem
                      key={player.player_id}
                      leading={<RankBadge>{index + 1}</RankBadge>}
                      title={player.player_name}
                      subtitle={`${player.wins}W · ${player.losses}L · ${player.played}P`}
                      trailing={<Pill tone="accent">{Math.round(player.win_rate)}%</Pill>}
                      onClick={() => navigateInTab('players', `player/${player.player_id}`)}
                    />
                  ))}
                </List>
              )}
            </div>
          </>
        )}
      </div>

      <nav className="tt-home-nav" aria-label="Main sections">
        {navItems.map((tabId) => {
          const meta = TAB_METADATA[tabId];
          const countDesc =
            tabId === 'players' ? `Search across ${fmt(playerCount)} players` :
            tabId === 'leagues' ? `${leagueCount} leagues, ${divisionCount} divisions` :
            meta.description;
          return (
            <a
              key={tabId}
              href="#"
              className="tt-home-nav-row"
              onClick={(e) => { e.preventDefault(); onOpenTab(tabId); }}
            >
              <div className="tt-home-nav-icon">
                <i className={meta.icon} />
              </div>
              <div className="tt-home-nav-copy">
                <span className="tt-home-nav-title">{meta.label}</span>
                <span className="tt-home-nav-desc">{countDesc}</span>
              </div>
              <i className="fa fa-angle-right tt-home-nav-chevron" />
            </a>
          );
        })}
      </nav>
    </>
  );
}
