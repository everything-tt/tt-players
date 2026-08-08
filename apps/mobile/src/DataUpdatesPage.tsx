import { useNavigate } from 'react-router-dom';
import { formatDate } from './player-shared';
import {
  useDataUpdatesQuery,
  type DataUpdateStage,
  type DataUpdateStageStatus,
} from './data-updates';
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

const PIPELINE_STAGES = [
  { key: 'wait-for-ingestion', label: 'Collect source updates', icon: 'fa fa-download' },
  { key: 'reconcile', label: 'Match player identities', icon: 'fa fa-link' },
  { key: 'ratings', label: 'Update ratings', icon: 'fa fa-chart-line' },
  { key: 'read-models', label: 'Publish app snapshots', icon: 'fa fa-database' },
] as const;

function statusTone(status: DataUpdateStageStatus | 'not-started') {
  if (status === 'completed') return 'success' as const;
  if (status === 'failed') return 'danger' as const;
  if (status === 'running') return 'accent' as const;
  if (status === 'waiting') return 'warning' as const;
  return 'neutral' as const;
}

function statusLabel(status: DataUpdateStageStatus | 'not-started'): string {
  if (status === 'not-started') return 'Not started';
  if (status === 'waiting') return 'Waiting';
  return `${status.slice(0, 1).toUpperCase()}${status.slice(1)}`;
}

function stageSubtitle(stage: DataUpdateStage | undefined): string {
  if (!stage) return 'Not started in this refresh yet';
  if (stage.error_message) return stage.error_message;
  if (stage.finished_at) return `Completed ${formatDate(stage.finished_at, { includeTime: true })}`;
  return `Last recorded ${formatDate(stage.recorded_at, { includeTime: true })}`;
}

function runStatusLabel(status: 'running' | 'completed' | 'failed'): string {
  if (status === 'running') return 'Refresh in progress';
  if (status === 'failed') return 'Refresh needs attention';
  return 'Refresh completed';
}

export function DataUpdatesPage() {
  const navigate = useNavigate();
  const updatesQuery = useDataUpdatesQuery();
  const data = updatesQuery.data;
  const run = data?.run ?? null;
  const stagesByKey = new Map(run?.stages.map((stage) => [stage.stage, stage]) ?? []);
  const completedStages = PIPELINE_STAGES.filter((stage) => stagesByKey.get(stage.key)?.status === 'completed').length;

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
        {updatesQuery.isLoading ? (
          <EmptyState
            iconClassName="fa fa-sync fa-spin"
            title="Loading update snapshot"
            message="Loading the latest recorded data refresh progress."
          />
        ) : updatesQuery.isError || !data ? (
          <EmptyState
            iconClassName="fa fa-exclamation-triangle"
            title="Update snapshot unavailable"
            message={updatesQuery.error instanceof Error ? updatesQuery.error.message : 'The data update snapshot could not be loaded.'}
            action={{ label: 'Try again', onClick: () => { void updatesQuery.refetch(); } }}
          />
        ) : !data.available ? (
          <EmptyState
            iconClassName="fa fa-database"
            title="Update history unavailable"
            message="Published pipeline progress has not been initialised yet."
          />
        ) : !run ? (
          <EmptyState
            iconClassName="fa fa-clock"
            title="No data refresh recorded"
            message="The first published pipeline run will appear here when it starts."
          />
        ) : (
          <>
            <PageSection
              surface="raised"
              density="standard"
              title="Latest data refresh"
              description="Read-only progress from the latest persisted processing run."
              meta={data.latest_recorded_at ? `Recorded ${formatDate(data.latest_recorded_at, { includeTime: true })}` : undefined}
            >
              <DesignList density="compact" divider="hairline" paginate={false}>
                <ListItem
                  leading={<IconCircle iconClassName={run.status === 'completed' ? 'fa fa-check' : run.status === 'failed' ? 'fa fa-exclamation-triangle' : 'fa fa-sync'} tone={run.status === 'completed' ? 'success' : run.status === 'failed' ? 'danger' : 'accent'} />}
                  title={runStatusLabel(run.status)}
                  subtitle={`Run ${run.run_key} · ${completedStages}/${PIPELINE_STAGES.length} stages completed`}
                  hideChevron
                />
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-clock" tone="neutral" />}
                  title={`Started ${formatDate(run.started_at, { includeTime: true })}`}
                  subtitle={run.finished_at ? `Finished ${formatDate(run.finished_at, { includeTime: true })}` : `Current stage: ${PIPELINE_STAGES.find((stage) => stage.key === run.current_stage)?.label ?? run.current_stage}`}
                  hideChevron
                />
              </DesignList>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Processing stages"
              description="These statuses are read from the persisted pipeline audit; this page does not inspect the live job queue."
            >
              <DesignList density="compact" divider="hairline" paginate={false}>
                {PIPELINE_STAGES.map((item) => {
                  const stage = stagesByKey.get(item.key);
                  const status = stage?.status ?? 'not-started';
                  return (
                    <ListItem
                      key={item.key}
                      leading={<IconCircle iconClassName={item.icon} tone={statusTone(status)} />}
                      title={`${item.label} · ${statusLabel(status)}`}
                      subtitle={stageSubtitle(stage)}
                      hideChevron
                    />
                  );
                })}
              </DesignList>
            </PageSection>

            {run.error_message ? (
              <PageSection surface="flat" density="compact" title="Latest recorded issue">
                <p className="tt-about-description">{run.error_message}</p>
              </PageSection>
            ) : null}
          </>
        )}
      </AppPageContent>
    </AppShellPage>
  );
}
