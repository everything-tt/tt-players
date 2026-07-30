import { useLocation, useNavigate } from 'react-router-dom';
import { formatDate, formatNumber } from './player-shared';
import { useSourceQualityQuery, type SourceHealth } from './source-quality';
import {
  AppButton,
  AppHeader,
  AppHeaderSpacer,
  AppPageContent,
  AppShellPage,
  EmptyState,
  IconCircle,
  List,
  ListItem,
  SectionHeader,
} from './ui/appkit';

type CoverageLocationState = { from?: string };

function healthMeta(health: SourceHealth) {
  if (health === 'healthy') {
    return { label: 'Healthy', icon: 'fa fa-check', tone: 'success' as const };
  }
  if (health === 'degraded') {
    return { label: 'Needs attention', icon: 'fa fa-exclamation', tone: 'danger' as const };
  }
  return { label: 'Not observed yet', icon: 'fa fa-question', tone: 'accent' as const };
}

function activityLabel(value: string | null): string {
  return value ? formatDate(value, { includeTime: true }) : 'No successful activity recorded';
}

export function DataCoveragePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as CoverageLocationState | null;
  const returnPath = state?.from?.startsWith('/tabs/') || state?.from === '/about'
    ? state.from
    : '/about';
  const qualityQuery = useSourceQualityQuery();
  const data = qualityQuery.data;

  const goBack = () => navigate(returnPath, { replace: true });
  const goHome = () => navigate('/tabs/home', { replace: true });

  return (
    <AppShellPage className="tt-about-page">
      <AppHeader
        title="Data Coverage"
        leftAction={{
          iconClassName: 'fas fa-chevron-left',
          onClick: goBack,
          position: 1,
          ariaLabel: 'Back',
        }}
        rightAction={{
          iconClassName: 'fas fa-home',
          onClick: goHome,
          position: 4,
          ariaLabel: 'Home',
        }}
      />
      <AppHeaderSpacer />
      <AppPageContent>
        {qualityQuery.isLoading ? (
          <EmptyState
            iconClassName="fa fa-sync fa-spin"
            title="Checking data sources"
            message="Loading source health and coverage metrics."
          />
        ) : qualityQuery.isError || !data ? (
          <section className="tt-player-section">
            <EmptyState
              iconClassName="fa fa-exclamation-triangle"
              title="Coverage unavailable"
              message={qualityQuery.error instanceof Error
                ? qualityQuery.error.message
                : 'The source quality report could not be loaded.'}
            />
            <AppButton full tone="primary" onClick={() => { void qualityQuery.refetch(); }}>
              Try Again
            </AppButton>
          </section>
        ) : (
          <>
            <section className="tt-player-section">
              <SectionHeader title="Coverage Summary" note={`${data.summary.providers} providers`} />
              <List divider="hairline">
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-database" tone="accent" />}
                  title={`${formatNumber(data.summary.leagues)} leagues · ${formatNumber(data.summary.competitions)} competitions`}
                  subtitle={`${formatNumber(data.summary.canonical_players)} players · ${formatNumber(data.summary.rubbers)} singles and doubles results`}
                  hideChevron
                />
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-calendar-check" tone="success" />}
                  title={`${data.summary.dated_rubbers_pct}% have a match date`}
                  subtitle={`${data.summary.full_score_rubbers_pct}% include a full game score`}
                  hideChevron
                />
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-link" tone="accent" />}
                  title={`${formatNumber(data.summary.pending_identity_suggestions)} identity suggestions awaiting review`}
                  subtitle={`${formatNumber(data.summary.missing_player_rubbers)} results are missing a singles player`}
                  hideChevron
                />
                <ListItem
                  leading={<IconCircle
                    iconClassName={data.summary.unhealthy_resources > 0 ? 'fa fa-exclamation' : 'fa fa-check'}
                    tone={data.summary.unhealthy_resources > 0 ? 'danger' : 'success'}
                  />}
                  title={`${data.summary.healthy} healthy · ${data.summary.degraded} need attention`}
                  subtitle={`${data.summary.unobserved} providers have no recorded activity · ${data.summary.unhealthy_resources} failing resources`}
                  hideChevron
                />
              </List>
            </section>

            {data.sources.map((source) => {
              const meta = healthMeta(source.health);
              return (
                <section className="tt-player-section" key={source.platform_id}>
                  <SectionHeader title={source.name} note={meta.label} />
                  <List divider="hairline">
                    <ListItem
                      leading={<IconCircle iconClassName={meta.icon} tone={meta.tone} />}
                      title={meta.label}
                      subtitle={`Latest activity: ${activityLabel(source.latest_activity_at)}`}
                      hideChevron
                    />
                    <ListItem
                      leading={<IconCircle iconClassName="fa fa-layer-group" tone="accent" />}
                      title={`${formatNumber(source.leagues)} leagues · ${formatNumber(source.competitions)} competitions`}
                      subtitle={`${formatNumber(source.fixtures)} fixtures · ${formatNumber(source.rubbers)} results`}
                      hideChevron
                    />
                    <ListItem
                      leading={<IconCircle iconClassName="fa fa-chart-bar" tone="success" />}
                      title={`${source.dated_rubbers_pct}% dated · ${source.full_score_rubbers_pct}% full scores`}
                      subtitle={`${formatNumber(source.canonical_players)} canonical players from ${formatNumber(source.external_players)} source profiles`}
                      hideChevron
                    />
                    <ListItem
                      leading={<IconCircle iconClassName="fa fa-sync" tone="accent" />}
                      title={`${formatNumber(source.total_scrapes)} stored payloads · ${formatNumber(source.failed_scrapes)} failed transforms`}
                      subtitle={`${formatNumber(source.source_instances)} registered instances · ${formatNumber(source.source_resources)} resources`}
                      hideChevron
                    />
                    {source.last_error ? (
                      <ListItem
                        leading={<IconCircle iconClassName="fa fa-bug" tone="danger" />}
                        title="Latest resource error"
                        subtitle={source.last_error}
                        hideChevron
                      />
                    ) : null}
                  </List>
                  <div className="mt-3">
                    <AppButton
                      full
                      tone="outline"
                      onClick={() => window.open(source.base_url, '_blank', 'noopener,noreferrer')}
                    >
                      Open Source Website
                    </AppButton>
                  </div>
                </section>
              );
            })}

            <p className="tt-section-meta">
              Report generated {formatDate(data.generated_at, { includeTime: true })}. Historical failures remain visible; a provider is marked degraded only when a registered resource has consecutive failures.
            </p>
          </>
        )}
      </AppPageContent>
    </AppShellPage>
  );
}
