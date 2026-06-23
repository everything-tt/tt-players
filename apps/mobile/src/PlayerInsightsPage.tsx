import './app-shell.css';
import { useParams } from 'react-router-dom';
import { SectionSkeleton, SkeletonBlock } from './components/Skeleton';
import { useTabNavigation } from './navigation/tab-navigation';
import { calcWinRate, getInitials, getQueryError } from './player-shared';
import { usePlayerExtendedStatsQuery, usePlayerInsightsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import { DetailHeader } from './components/DetailHeader';
import {
  HeroCard,
  List,
  ListItem,
  IconCircle,
  EmptyState,
  ErrorState,
  SectionHeader,
} from './ui/appkit';

function PlayerInsightsSkeleton() {
  return (
    <>
      <section className="tt-hero" aria-label="Loading insights overview">
        <div className="tt-hero__top">
          <div className="tt-hero__copy">
            <SkeletonBlock className="tt-skeleton-eyebrow" />
            <SkeletonBlock className="tt-skeleton-title" />
            <SkeletonBlock className="tt-skeleton-text mt-2" />
          </div>
          <SkeletonBlock className="tt-skeleton-avatar" />
        </div>
      </section>
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={3} />
    </>
  );
}

export function PlayerInsightsPage() {
  const { switchTab } = useTabNavigation();
  const { playerId = '' } = useParams<{ playerId: string }>();

  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const insightsQuery = usePlayerInsightsQuery(playerId, Boolean(playerId));
  const stats = statsQuery.data ?? null;
  const insights = insightsQuery.data ?? null;
  const isLoading = statsQuery.isLoading || insightsQuery.isLoading;
  const error = playerId
    ? getQueryError(statsQuery.error) ?? getQueryError(insightsQuery.error)
    : 'Missing player id';

  const momentum = insights?.form.momentum ?? 'new';
  const winRate = stats ? calcWinRate(stats.wins, stats.total) : 0;

  return (
    <TabShellPage>
      <DetailHeader title={stats?.player_name ?? 'Insights'} backFallback={playerId ? `player/${playerId}` : ''} />
      <div className="page-content app-shell-content">
        {isLoading ? (
          <PlayerInsightsSkeleton />
        ) : error || !stats || !insights ? (
          <ErrorState message="Failed to load insights." onRetry={() => switchTab('home', 'root')} />
        ) : (
          <>
            <HeroCard
              eyebrow="Insights Overview"
              title={stats.player_name}
              summary={<span style={{ textTransform: 'capitalize' }}>Momentum: {momentum}</span>}
              actions={<span className="tt-player-summary-avatar"><span className="tt-player-summary-initials">{getInitials(stats.player_name)}</span></span>}
            >
              <div className="tt-player-spotlight">
                <div className="tt-player-winrate">
                  <span className="tt-player-winrate-value">{winRate}%</span>
                  <span className="tt-player-winrate-label">Win Rate</span>
                </div>
                <div className="tt-player-hero-stats">
                  <div className="tt-player-hero-stat"><span className="tt-player-hero-stat-value">{stats.total}</span><span className="tt-player-hero-stat-label">Played</span></div>
                  <div className="tt-player-hero-stat"><span className="tt-player-hero-stat-value">{stats.wins}</span><span className="tt-player-hero-stat-label">Wins</span></div>
                  <div className="tt-player-hero-stat"><span className="tt-player-hero-stat-value">{stats.losses}</span><span className="tt-player-hero-stat-label">Losses</span></div>
                </div>
              </div>
            </HeroCard>

            <section className="tt-player-section" aria-labelledby="tt-insights-rivals-title">
              <SectionHeader title="Rival Intelligence" note="Trends" />
              <List divider="hairline">
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-bolt" tone="danger" />}
                  title={insights.rivals.toughest ? `Toughest: ${insights.rivals.toughest.opponent_name} (${insights.rivals.toughest.win_rate}% WR)` : 'Toughest: N/A'}
                  hideChevron
                />
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-smile" tone="success" />}
                  title={insights.rivals.easiest ? `Easiest: ${insights.rivals.easiest.opponent_name} (${insights.rivals.easiest.win_rate}% WR)` : 'Easiest: N/A'}
                  hideChevron
                />
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-arrow-up" tone="accent" />}
                  title={insights.rivals.improving_vs ? `Improving vs: ${insights.rivals.improving_vs.opponent_name} (+${insights.rivals.improving_vs.delta_points})` : 'Improving vs: N/A'}
                  hideChevron
                />
              </List>
            </section>

            <section className="tt-player-section" aria-labelledby="tt-insights-career-title">
              <SectionHeader title="Career" note="Timeline" />
              {insights.career_by_year.length === 0 ? (
                <EmptyState iconClassName="fa fa-history" title="Not enough history yet" message="Play a few more matches to see your career timeline." />
              ) : (
                <List divider="hairline">
                  {insights.career_by_year.map((year: any) => (
                    <ListItem
                      key={year.year}
                      leading={<IconCircle iconClassName="fa fa-calendar-alt" tone="neutral" />}
                      title={`${year.year} · ${year.played} played · ${year.win_rate}% WR`}
                      hideChevron
                    />
                  ))}
                </List>
              )}
            </section>
          </>
        )}
      </div>
    </TabShellPage>
  );
}
