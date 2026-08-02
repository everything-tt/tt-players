import './app-shell.css';
import './player-insights.css';
import './player-insights-progress.css';
import { useNavigate, useParams } from 'react-router-dom';
import { PlayerCareerStory } from './components/PlayerCareerStory';
import { PlayerInsightsSummary } from './components/PlayerInsightsSummary';
import { PlayerRatingHistoryChart } from './components/PlayerRatingHistoryChart';
import { PlayerRivalIntelligence } from './components/PlayerRivalIntelligence';
import { SectionSkeleton, SkeletonBlock } from './components/Skeleton';
import { getQueryError } from './player-shared';
import {
  usePlayerExtendedStatsQuery,
  usePlayerInsightsQuery,
  usePlayerRivalsQuery,
} from './queries';
import { TabShellPage } from './TabShellPage';
import { DetailHeader } from './components/DetailHeader';
import { ErrorState } from './ui/appkit';

function PlayerInsightsSkeleton() {
  return (
    <div className="tt-insights-page" aria-label="Loading player insights">
      <section className="tt-insights-card">
        <SkeletonBlock className="tt-skeleton-text" />
        <div className="tt-insights-summary-grid mt-2">
          {Array.from({ length: 4 }).map((_, index) => (
            <SkeletonBlock key={index} className="tt-skeleton-stat" />
          ))}
        </div>
      </section>
      <SectionSkeleton rows={3} />
      <SectionSkeleton rows={4} />
      <SectionSkeleton rows={4} />
    </div>
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
      <div className="page-content app-shell-content tt-insights-page">
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
      </div>
    </TabShellPage>
  );
}
