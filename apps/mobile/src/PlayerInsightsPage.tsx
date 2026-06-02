import { type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { useTabNavigation } from './navigation/tab-navigation';
import { calcWinRate, getInitials } from './player-shared';
import { usePlayerExtendedStatsQuery, usePlayerInsightsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import {
  AppHeader,
  AppHeaderSpacer,
  AppListGroup,
  AppListItem,
  AppLoadingCard,
  AppMessageCard,
  AppPageContent,
} from './ui/appkit';

export function PlayerInsightsPage() {
  const { goBackInActiveTab, switchTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();

  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const insightsQuery = usePlayerInsightsQuery(playerId, Boolean(playerId));
  const stats = statsQuery.data ?? null;
  const insights = insightsQuery.data ?? null;
  const isLoading = statsQuery.isLoading || insightsQuery.isLoading;
  const error = playerId
    ? (statsQuery.error instanceof Error ? statsQuery.error.message : null)
      || (insightsQuery.error instanceof Error ? insightsQuery.error.message : null)
    : 'Missing player id';

  const momentum = insights?.form.momentum ?? 'new';
  const winRate = stats ? calcWinRate(stats.wins, stats.total) : 0;

  const goBack = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    goBackInActiveTab(playerId ? `player/${playerId}` : '');
  };

  const goHome = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
    switchTab('home', 'root');
  };

  const preventDefaultLink = (event: MouseEvent<HTMLAnchorElement>) => {
    event.preventDefault();
  };

  return (
    <TabShellPage>
      <AppHeader
        title={stats?.player_name ?? 'Insights'}
        onTitleClick={goHome}
        leftAction={{ iconClassName: 'fas fa-chevron-left', onClick: goBack, position: 1, ariaLabel: 'Back' }}
        rightAction={{ iconClassName: 'fas fa-home', onClick: goHome, position: 4, ariaLabel: 'Home' }}
      />
      <AppHeaderSpacer />

      <AppPageContent>
        {isLoading ? (
          <AppLoadingCard message="Loading insights..." />
        ) : error || !stats || !insights ? (
          <AppMessageCard
            message="Failed to load insights."
            action={{ label: 'Back', onClick: goBack }}
          />
        ) : (
          <>
            <section className="tt-insights-hero" aria-label="Insights overview">
              <div className="tt-player-hero-top">
                <div className="tt-player-hero-copy">
                  <p className="tt-player-eyebrow">Insights Overview</p>
                  <h1 className="tt-player-title">{stats.player_name}</h1>
                  <p className="tt-player-summary-line text-capitalize">Momentum: {momentum}</p>
                </div>
                <div className="tt-player-summary-avatar" aria-hidden="true">
                  <span className="tt-player-summary-initials">{getInitials(stats.player_name)}</span>
                </div>
              </div>

              <div className="tt-player-spotlight">
                <div className="tt-player-winrate">
                  <span className="tt-player-winrate-value">{winRate}%</span>
                  <span className="tt-player-winrate-label">Win Rate</span>
                </div>
                <div className="tt-player-hero-stats">
                  <div className="tt-player-hero-stat">
                    <span className="tt-player-hero-stat-value">{stats.total}</span>
                    <span className="tt-player-hero-stat-label">Played</span>
                  </div>
                  <div className="tt-player-hero-stat">
                    <span className="tt-player-hero-stat-value">{stats.wins}</span>
                    <span className="tt-player-hero-stat-label">Wins</span>
                  </div>
                  <div className="tt-player-hero-stat">
                    <span className="tt-player-hero-stat-value">{stats.losses}</span>
                    <span className="tt-player-hero-stat-label">Losses</span>
                  </div>
                </div>
              </div>
            </section>

            <section className="tt-player-section" aria-labelledby="tt-insights-rivals-title">
              <div className="tt-player-section-header">
                <h2 id="tt-insights-rivals-title" className="tt-player-section-title">Rival Intelligence</h2>
                <span className="tt-player-section-note">Trends</span>
              </div>
                <AppListGroup size="small">
                  <AppListItem
                    iconClassName="fa fa-bolt rounded-xl tt-icon-danger"
                    title={`Toughest: ${insights.rivals.toughest ? `${insights.rivals.toughest.opponent_name} (${insights.rivals.toughest.win_rate}% WR)` : 'N/A'}`}
                    onClick={preventDefaultLink}
                  />
                  <AppListItem
                    iconClassName="fa fa-smile rounded-xl tt-icon-success"
                    title={`Easiest: ${insights.rivals.easiest ? `${insights.rivals.easiest.opponent_name} (${insights.rivals.easiest.win_rate}% WR)` : 'N/A'}`}
                    onClick={preventDefaultLink}
                  />
                  <AppListItem
                    iconClassName="fa fa-arrow-up rounded-xl tt-icon-trend"
                    title={`Improving vs: ${insights.rivals.improving_vs ? `${insights.rivals.improving_vs.opponent_name} (+${insights.rivals.improving_vs.delta_points})` : 'N/A'}`}
                    onClick={preventDefaultLink}
                    borderless
                  />
                </AppListGroup>
            </section>

            <section className="tt-player-section" aria-labelledby="tt-insights-career-title">
              <div className="tt-player-section-header">
                <h2 id="tt-insights-career-title" className="tt-player-section-title">Career</h2>
                <span className="tt-player-section-note">Timeline</span>
              </div>
                {insights.career_by_year.length === 0 ? (
                  <p className="tt-player-section-state mb-0">Not enough history yet.</p>
                ) : (
                  <AppListGroup size="small">
                    {insights.career_by_year.map((year: any, index: number) => (
                      <AppListItem
                        key={year.year}
                        iconClassName="fa fa-calendar-alt rounded-xl tt-icon-calendar"
                        title={`${year.year} · ${year.played} played · ${year.win_rate}% WR`}
                        onClick={preventDefaultLink}
                        borderless={index === insights.career_by_year.length - 1}
                      />
                    ))}
                  </AppListGroup>
                )}
            </section>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
