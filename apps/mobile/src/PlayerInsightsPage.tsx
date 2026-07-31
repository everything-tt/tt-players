import './app-shell.css';
import { useParams } from 'react-router-dom';
import { PlayerRatingHistoryChart } from './components/PlayerRatingHistoryChart';
import { SectionSkeleton, SkeletonBlock } from './components/Skeleton';
import { useTabNavigation } from './navigation/tab-navigation';
import { calcWinRate, getInitials, getQueryError } from './player-shared';
import { usePlayerExtendedStatsQuery, usePlayerInsightsQuery } from './queries';
import { TabShellPage } from './TabShellPage';
import { DetailHeader } from './components/DetailHeader';
import {
  DesignAvatar,
  DesignList,
  EmptyState,
  EntityHero,
  ErrorState,
  IconCircle,
  ListItem,
  MetricGrid,
  PageSection,
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
  const error = playerId ? getQueryError(statsQuery.error) ?? getQueryError(insightsQuery.error) : 'Missing player id';
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
            <EntityHero
              eyebrow="Insights Overview"
              title={stats.player_name}
              subtitle={`Momentum: ${momentum}`}
              leading={<DesignAvatar text={getInitials(stats.player_name)} size="hero" variant="solid" />}
            >
              <MetricGrid
                columns={4}
                metrics={[
                  { label: 'Win Rate', value: `${winRate}%` },
                  { label: 'Played', value: stats.total },
                  { label: 'Wins', value: stats.wins },
                  { label: 'Losses', value: stats.losses },
                ]}
              />
            </EntityHero>

            <PlayerRatingHistoryChart playerId={playerId} />

            <PageSection surface="flat" density="compact" title="Rival Intelligence" note="Trends">
              <DesignList density="compact" divider="hairline" paginate={false}>
                <ListItem leading={<IconCircle iconClassName="fa fa-bolt" tone="danger" />} title={insights.rivals.toughest ? `Toughest: ${insights.rivals.toughest.opponent_name} (${insights.rivals.toughest.win_rate}% WR)` : 'Toughest: N/A'} hideChevron />
                <ListItem leading={<IconCircle iconClassName="fa fa-smile" tone="success" />} title={insights.rivals.easiest ? `Easiest: ${insights.rivals.easiest.opponent_name} (${insights.rivals.easiest.win_rate}% WR)` : 'Easiest: N/A'} hideChevron />
                <ListItem leading={<IconCircle iconClassName="fa fa-arrow-up" tone="accent" />} title={insights.rivals.improving_vs ? `Improving vs: ${insights.rivals.improving_vs.opponent_name} (+${insights.rivals.improving_vs.delta_points})` : 'Improving vs: N/A'} hideChevron />
              </DesignList>
            </PageSection>

            <PageSection surface="flat" density="compact" title="Career" note="Timeline">
              {insights.career_by_year.length === 0 ? (
                <EmptyState iconClassName="fa fa-history" title="Not enough history yet" message="Play a few more matches to see your career timeline." />
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {insights.career_by_year.map((year: any) => (
                    <ListItem key={year.year} leading={<IconCircle iconClassName="fa fa-calendar-alt" tone="neutral" />} title={`${year.year} · ${year.played} played · ${year.win_rate}% WR`} hideChevron />
                  ))}
                </DesignList>
              )}
            </PageSection>
          </>
        )}
      </div>
    </TabShellPage>
  );
}
