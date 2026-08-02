import './app-shell.css';
import './player-insights.css';
import { useNavigate, useParams } from 'react-router-dom';
import { PlayerCareerStory } from './components/PlayerCareerStory';
import { PlayerInsightsSummary } from './components/PlayerInsightsSummary';
import { PlayerRatingHistoryChart } from './components/PlayerRatingHistoryChart';
import { PlayerRivalIntelligence } from './components/PlayerRivalIntelligence';
import { SkeletonBlock } from './components/Skeleton';
import { getQueryError } from './player-shared';
import {
  usePlayerExtendedStatsQuery,
  usePlayerInsightsQuery,
  usePlayerRivalsQuery,
} from './queries';
import { TabShellPage } from './TabShellPage';
import { DetailHeader } from './components/DetailHeader';
import { AppPageContent, ErrorState, PageSection } from './ui/appkit';

function PlayerInsightsSkeleton() {
  return (
    <>
      {Array.from({ length: 4 }).map((_, sectionIndex) => (
        <PageSection
          key={sectionIndex}
          surface="flat"
          density="compact"
          ariaLabelledby={undefined}
          className="tt-insights-skeleton-section"
        >
          <SkeletonBlock className="tt-skeleton-text" />
          <div className="tt-insights-skeleton-metrics">
            {Array.from({ length: sectionIndex === 0 || sectionIndex === 3 ? 4 : 3 }).map((__, metricIndex) => (
              <SkeletonBlock key={metricIndex} className="tt-skeleton-stat" />
            ))}
          </div>
        </PageSection>
      ))}
    </>
  );
}

export function PlayerInsightsPage() {
  const navigate = useNavigate();
  const { playerId = '' } = useParams<{ playerId: string }>();
  const statsQuery = usePlayerExtendedStatsQuery(playerId, Boolean(playerId));
  const insightsQuery = usePlayerInsightsQuery(playerId, Boolean(playerId));
  const rivalsQuery = usePlayerRivalsQuery(playerId, Boolean(playerId));
  const stats = statsQuery.data ?? null;
  const insights = insightsQuery.data ?? null;
  const isLoading = statsQuery.isLoading || insightsQuery.isLoading;
  const error = playerId
    ? getQueryError(statsQuery.error) ?? getQueryError(insightsQuery.error)
    : 'Missing player id';

  const retryPrimaryData = () => {
    void statsQuery.refetch();
    void insightsQuery.refetch();
  };

  return (
    <TabShellPage>
      <DetailHeader title={stats?.player_name ?? 'Insights'} backFallback={playerId ? `player/${playerId}` : ''} />
      <AppPageContent className="tt-insights-page">
        {isLoading ? (
          <PlayerInsightsSkeleton />
        ) : error || !stats || !insights ? (
          <ErrorState message="Failed to load player insights." onRetry={retryPrimaryData} />
        ) : (
          <>
            <PlayerInsightsSummary stats={stats} insights={insights} />

            <PlayerRatingHistoryChart
              playerId={playerId}
              recentResults={insights.form.recent_results}
            />

            <PlayerRivalIntelligence
              data={rivalsQuery.data ?? null}
              loading={rivalsQuery.isLoading}
              error={getQueryError(rivalsQuery.error)}
              onRetry={() => { void rivalsQuery.refetch(); }}
              onOpenOpponent={(opponentId) => navigate(`/h2h/${playerId}/${opponentId}`)}
            />

            <PlayerCareerStory insights={insights} />
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
