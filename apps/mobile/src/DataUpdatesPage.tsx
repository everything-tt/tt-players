import { useNavigate } from 'react-router-dom';
import { formatDate, formatNumber } from './player-shared';
import { useSourceQualityQuery, type SourceHealth } from './source-quality';
import {
  AppHeader,
  AppHeaderSpacer,
  AppPageContent,
  AppShellPage,
  DesignList,
  EmptyState,
  IconCircle,
  ListItem,
  PageSection,
} from './ui/appkit';

function healthTone(health: SourceHealth) {
  if (health === 'healthy') return 'success' as const;
  if (health === 'degraded') return 'danger' as const;
  return 'neutral' as const;
}

function activityLabel(value: string | null): string {
  return value ? formatDate(value, { includeTime: true }) : 'No successful update recorded';
}

export function DataUpdatesPage() {
  const navigate = useNavigate();
  const qualityQuery = useSourceQualityQuery();
  const data = qualityQuery.data;

  return (
    <AppShellPage className="tt-about-page">
      <AppHeader
        title="Data Updates"
        heading
        leftAction={{
          iconClassName: 'fas fa-chevron-left',
          onClick: () => navigate('/tabs/home', { replace: true }),
          position: 1,
          ariaLabel: 'Back',
        }}
      />
      <AppHeaderSpacer />
      <AppPageContent>
        {qualityQuery.isLoading ? (
          <EmptyState iconClassName="fa fa-sync fa-spin" title="Loading update snapshot" message="Loading the latest published data update report." />
        ) : qualityQuery.isError || !data ? (
          <EmptyState
            iconClassName="fa fa-exclamation-triangle"
            title="Update snapshot unavailable"
            message={qualityQuery.error instanceof Error ? qualityQuery.error.message : 'The data update snapshot could not be loaded.'}
          />
        ) : (
          <>
            <PageSection
              surface="raised"
              density="standard"
              title="Latest published snapshot"
              note={formatDate(data.generated_at, { includeTime: true })}
              description="A read-only summary of the latest source activity. This page uses the published data-quality snapshot rather than querying the live scraping queue."
            >
              <DesignList density="compact" divider="hairline" paginate={false}>
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-database" tone="accent" />}
                  title={`${formatNumber(data.summary.providers)} data providers`}
                  subtitle={`${formatNumber(data.summary.leagues)} leagues · ${formatNumber(data.summary.competitions)} competitions`}
                  hideChevron
                />
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-check" tone={data.summary.degraded > 0 ? 'warning' : 'success'} />}
                  title={`${data.summary.healthy} healthy · ${data.summary.degraded} need attention`}
                  subtitle={`${data.summary.unobserved} providers have no recorded activity`}
                  hideChevron
                />
              </DesignList>
            </PageSection>

            {data.sources.map((source) => (
              <PageSection
                key={source.platform_id}
                surface="flat"
                density="compact"
                title={source.name}
                note={activityLabel(source.latest_activity_at)}
              >
                <DesignList density="compact" divider="hairline" paginate={false}>
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-clock" tone={healthTone(source.health)} />}
                    title="Latest observed update"
                    subtitle={activityLabel(source.latest_activity_at)}
                    hideChevron
                  />
                  <ListItem
                    leading={<IconCircle iconClassName="fa fa-layer-group" tone="accent" />}
                    title={`${formatNumber(source.total_scrapes)} stored payloads`}
                    subtitle={`${formatNumber(source.failed_scrapes)} failed transforms · ${formatNumber(source.rubbers)} results available`}
                    hideChevron
                  />
                </DesignList>
              </PageSection>
            ))}
          </>
        )}
      </AppPageContent>
    </AppShellPage>
  );
}
