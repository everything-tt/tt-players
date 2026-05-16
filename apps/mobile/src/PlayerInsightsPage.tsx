import { useEffect, useState, type MouseEvent } from 'react';
import { useParams } from 'react-router-dom';
import './app-shell.css';
import { useTabNavigation } from './navigation/tab-navigation';
import { apiFetch, type ExtendedPlayerStats, type PlayerInsights } from './player-shared';
import { TabShellPage } from './TabShellPage';
import {
  AppCard,
  AppCardContent,
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

  const [stats, setStats] = useState<ExtendedPlayerStats | null>(null);
  const [insights, setInsights] = useState<PlayerInsights | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const momentum = insights?.form.momentum ?? 'new';

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

  useEffect(() => {
    if (!playerId) {
      setError('Missing player id');
      setIsLoading(false);
      return;
    }

    const abortController = new AbortController();

    const load = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const [statsPayload, insightsPayload] = await Promise.all([
          apiFetch<ExtendedPlayerStats>(`/players/${playerId}/stats/extended`, abortController.signal),
          apiFetch<PlayerInsights>(`/players/${playerId}/insights`, abortController.signal),
        ]);

        setStats(statsPayload);
        setInsights(insightsPayload);
      } catch (fetchError) {
        if ((fetchError as Error).name === 'AbortError') return;
        setStats(null);
        setInsights(null);
        setError((fetchError as Error).message || 'Failed to load insights');
      } finally {
        setIsLoading(false);
      }
    };

    load();

    return () => {
      abortController.abort();
    };
  }, [playerId]);

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
            tone="danger"
            action={{ label: 'Back', onClick: goBack }}
          />
        ) : (
          <>
            <AppCard className="bg-6" cardHeight={230}>
              <div className="card-bottom ms-3 me-3 mb-3">
                <p className="color-white opacity-60 mb-1">Insights Overview</p>
                <h1 className="font-28 line-height-l color-white mb-1">{stats.player_name}</h1>
                <p className="color-white opacity-80 mb-0 text-capitalize">Momentum: {momentum}</p>
              </div>
            </AppCard>

            <AppCard>
              <AppCardContent className="mb-2">
                <p className="mb-n1 color-highlight font-600">Rival Intelligence</p>
                <h4>Trends</h4>
                <AppListGroup size="small">
                  <AppListItem
                    iconClassName="fa fa-bolt rounded-xl bg-red-dark color-white"
                    title={`Toughest: ${insights.rivals.toughest ? `${insights.rivals.toughest.opponent_name} (${insights.rivals.toughest.win_rate}% WR)` : 'N/A'}`}
                    onClick={preventDefaultLink}
                  />
                  <AppListItem
                    iconClassName="fa fa-smile rounded-xl bg-green-dark color-white"
                    title={`Easiest: ${insights.rivals.easiest ? `${insights.rivals.easiest.opponent_name} (${insights.rivals.easiest.win_rate}% WR)` : 'N/A'}`}
                    onClick={preventDefaultLink}
                  />
                  <AppListItem
                    iconClassName="fa fa-arrow-up rounded-xl bg-blue-dark color-white"
                    title={`Improving vs: ${insights.rivals.improving_vs ? `${insights.rivals.improving_vs.opponent_name} (+${insights.rivals.improving_vs.delta_points})` : 'N/A'}`}
                    onClick={preventDefaultLink}
                    borderless
                  />
                </AppListGroup>
              </AppCardContent>
            </AppCard>

            <AppCard>
              <AppCardContent className="mb-2">
                <p className="mb-n1 color-highlight font-600">Career</p>
                <h4>Timeline</h4>
                {insights.career_by_year.length === 0 ? (
                  <p className="mb-0">Not enough history yet.</p>
                ) : (
                  <AppListGroup size="small">
                    {insights.career_by_year.map((year: any, index: number) => (
                      <AppListItem
                        key={year.year}
                        iconClassName="fa fa-calendar-alt rounded-xl bg-green-dark color-white"
                        title={`${year.year} · ${year.played} played · ${year.win_rate}% WR`}
                        onClick={preventDefaultLink}
                        borderless={index === insights.career_by_year.length - 1}
                      />
                    ))}
                  </AppListGroup>
                )}
              </AppCardContent>
            </AppCard>
          </>
        )}
      </AppPageContent>
    </TabShellPage>
  );
}
