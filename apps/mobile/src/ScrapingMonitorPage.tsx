import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { formatDate, formatNumber } from './player-shared';
import {
  type PipelineRunStatus,
  type PipelineStageStatus,
  type QueueJobState,
  type ScrapeStatus,
  type ScrapingMonitorState,
  type ScrapingPipelineStage,
  useScrapingMonitorQuery,
} from './scraping-monitor';
import {
  AppButton,
  AppHeader,
  AppHeaderSpacer,
  AppPageContent,
  AppShellPage,
  DesignList,
  EmptyState,
  IconCircle,
  ListItem,
  PageSection,
  Pill,
} from './ui/appkit';
import './ScrapingMonitorPage.css';

type MonitorLocationState = { from?: string };

type Tone = 'accent' | 'success' | 'danger' | 'warning' | 'neutral';

const WINDOW_OPTIONS = [
  { hours: 24, label: '24 hours' },
  { hours: 24 * 7, label: '7 days' },
  { hours: 24 * 14, label: '14 days' },
];

const TASK_LABELS: Record<string, string> = {
  scrapeUrlTask: 'Fetch source URL',
  processLogTask: 'Transform payload',
  scrapeMatchesTask: 'Fetch league matches',
  scrapeMatchSetsBatchTask: 'Fetch match sets',
  processMatchSetsBatchTask: 'Process match sets',
  scrapeSport80EventsTask: 'Discover Sport80 events',
  scrapeSport80EventResultsTask: 'Fetch Sport80 results',
  scrapeSport80RankingsDiscoveryTask: 'Discover Sport80 rankings',
  scrapeSport80RankingTableTask: 'Fetch Sport80 rankings',
  completeDailyPipelineTask: 'Complete daily pipeline',
};

const PIPELINE_STAGE_LABELS: Record<string, string> = {
  'wait-for-ingestion': 'Wait for ingestion',
  reconcile: 'Reconcile players',
  ratings: 'Calculate ratings',
  'read-models': 'Refresh read models',
};

function taskLabel(identifier: string): string {
  return TASK_LABELS[identifier] ?? identifier.replace(/Task$/, '').replace(/([a-z])([A-Z])/g, '$1 $2');
}

function pipelineStageLabel(stage: string): string {
  return PIPELINE_STAGE_LABELS[stage] ?? stage.replace(/-/g, ' ');
}

function stateMeta(state: ScrapingMonitorState): { label: string; detail: string; icon: string; tone: Tone } {
  if (state === 'attention') return { label: 'Needs attention', detail: 'A queue job, pipeline run, or source resource is failing.', icon: 'fa fa-exclamation-triangle', tone: 'danger' };
  if (state === 'running') return { label: 'Scraping in progress', detail: 'Jobs, pipeline stages, or payload transforms are actively waiting or running.', icon: 'fa fa-sync fa-spin', tone: 'accent' };
  if (state === 'scheduled') return { label: 'Next work scheduled', detail: 'No job is running now; deferred jobs are waiting for their run time.', icon: 'fa fa-clock', tone: 'warning' };
  if (state === 'idle') return { label: 'Up to date', detail: 'No active scrape work or current failures were detected.', icon: 'fa fa-check', tone: 'success' };
  return { label: 'No activity observed', detail: 'No scrape payloads or pipeline runs were recorded in this time window.', icon: 'fa fa-question', tone: 'neutral' };
}

function queueStateMeta(state: QueueJobState): { label: string; icon: string; tone: Tone } {
  if (state === 'failed') return { label: 'Failed', icon: 'fa fa-times', tone: 'danger' };
  if (state === 'running') return { label: 'Running', icon: 'fa fa-sync fa-spin', tone: 'accent' };
  if (state === 'scheduled') return { label: 'Scheduled', icon: 'fa fa-clock', tone: 'warning' };
  return { label: 'Ready', icon: 'fa fa-play', tone: 'accent' };
}

function scrapeStatusMeta(status: ScrapeStatus): { label: string; icon: string; tone: Tone } {
  if (status === 'failed') return { label: 'Failed', icon: 'fa fa-times', tone: 'danger' };
  if (status === 'processed') return { label: 'Processed', icon: 'fa fa-check', tone: 'success' };
  return { label: 'Pending transform', icon: 'fa fa-hourglass-half', tone: 'warning' };
}

function pipelineRunStatusMeta(status: PipelineRunStatus): { label: string; icon: string; tone: Tone } {
  if (status === 'failed') return { label: 'Failed', icon: 'fa fa-times', tone: 'danger' };
  if (status === 'completed') return { label: 'Completed', icon: 'fa fa-check', tone: 'success' };
  return { label: 'Running', icon: 'fa fa-sync fa-spin', tone: 'accent' };
}

function pipelineStageStatusMeta(status: PipelineStageStatus): { label: string; icon: string; tone: Tone } {
  if (status === 'failed') return { label: 'Failed', icon: 'fa fa-times', tone: 'danger' };
  if (status === 'completed') return { label: 'Completed', icon: 'fa fa-check', tone: 'success' };
  if (status === 'waiting') return { label: 'Waiting', icon: 'fa fa-clock', tone: 'warning' };
  return { label: 'Running', icon: 'fa fa-sync fa-spin', tone: 'accent' };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(durationMs: number | null): string {
  if (durationMs === null) return 'In progress';
  if (durationMs < 1_000) return `${durationMs} ms`;
  const totalSeconds = Math.round(durationMs / 1_000);
  if (totalSeconds < 60) return `${totalSeconds} sec`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return seconds > 0 ? `${minutes} min ${seconds} sec` : `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours} hr ${remainingMinutes} min` : `${hours} hr`;
}

function endpointLabel(value: string): string {
  try {
    const url = new URL(value);
    const path = `${url.pathname}${url.search}`;
    return `${url.hostname}${path === '/' ? '' : path}`;
  } catch {
    return value;
  }
}

function timeLabel(value: string | null, fallback: string): string {
  return value ? formatDate(value, { includeTime: true }) : fallback;
}

function countSummary(parts: Array<[number, string]>): string {
  return parts.filter(([count]) => count > 0).map(([count, label]) => `${formatNumber(count)} ${label}`).join(' · ') || 'No queued work';
}

function numberSummaryValue(summary: Record<string, unknown>, key: string): number | null {
  const value = summary[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function booleanSummaryValue(summary: Record<string, unknown>, key: string): boolean | null {
  const value = summary[key];
  return typeof value === 'boolean' ? value : null;
}

function pipelineStageSummary(stage: ScrapingPipelineStage): string | null {
  const pending = numberSummaryValue(stage.summary, 'pending');
  const failed = numberSummaryValue(stage.summary, 'failed');
  const periods = numberSummaryValue(stage.summary, 'processed_periods');
  const matches = numberSummaryValue(stage.summary, 'processed_matches');
  const replayed = booleanSummaryValue(stage.summary, 'replayed');
  const parts: string[] = [];

  if (pending !== null) parts.push(`${formatNumber(pending)} ingestion jobs pending`);
  if (failed !== null && failed > 0) parts.push(`${formatNumber(failed)} ingestion jobs failed`);
  if (periods !== null) parts.push(`${formatNumber(periods)} rating periods`);
  if (matches !== null) parts.push(`${formatNumber(matches)} matches`);
  if (replayed === true) parts.push('rating replay used');

  return parts.length > 0 ? parts.join(' · ') : null;
}

export function ScrapingMonitorPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as MonitorLocationState | null;
  const returnPath = state?.from === '/data-coverage' || state?.from === '/about' ? state.from : '/about';
  const [hours, setHours] = useState(24 * 7);
  const [expandedRunKey, setExpandedRunKey] = useState<string | null>(null);
  const monitorQuery = useScrapingMonitorQuery(hours);
  const data = monitorQuery.data;
  const meta = data ? stateMeta(data.state) : null;

  return (
    <AppShellPage className="tt-scraping-monitor-page">
      <AppHeader
        title="Scraping Monitor"
        heading
        leftAction={{
          iconClassName: 'fas fa-chevron-left',
          onClick: () => navigate(returnPath, { replace: true }),
          position: 1,
          ariaLabel: 'Back',
        }}
        rightAction={{
          iconClassName: monitorQuery.isFetching ? 'fa fa-sync fa-spin' : 'fa fa-sync',
          onClick: () => { void monitorQuery.refetch(); },
          position: 4,
          ariaLabel: 'Refresh scraping monitor',
        }}
      />
      <AppHeaderSpacer />
      <AppPageContent>
        <div className="tt-monitor-window" aria-label="Monitoring window">
          {WINDOW_OPTIONS.map((option) => (
            <AppButton
              key={option.hours}
              tone={hours === option.hours ? 'primary' : 'outline'}
              onClick={() => setHours(option.hours)}
            >
              {option.label}
            </AppButton>
          ))}
        </div>

        {monitorQuery.isLoading ? (
          <EmptyState iconClassName="fa fa-sync fa-spin" title="Checking scraping activity" message="Loading queue, pipeline, payload, and source audit data." />
        ) : monitorQuery.isError || !data || !meta ? (
          <PageSection surface="flat" density="compact">
            <EmptyState
              iconClassName="fa fa-exclamation-triangle"
              title="Scraping monitor unavailable"
              message={monitorQuery.error instanceof Error ? monitorQuery.error.message : 'The scraping monitor could not be loaded.'}
            />
            <AppButton full tone="primary" onClick={() => { void monitorQuery.refetch(); }}>Try Again</AppButton>
          </PageSection>
        ) : (
          <>
            <PageSection surface="raised" density="standard" title="Live Status" note="Auto-refreshes every 15 seconds">
              <div className="tt-monitor-status">
                <IconCircle iconClassName={meta.icon} tone={meta.tone} />
                <div>
                  <strong>{meta.label}</strong>
                  <p>{meta.detail}</p>
                </div>
              </div>

              <div className="tt-monitor-progress" aria-label={`Transform progress ${data.scrapes.transform_progress_pct}%`}>
                <div className="tt-monitor-progress__header">
                  <span>Payload transform progress</span>
                  <strong>{data.scrapes.transform_progress_pct}%</strong>
                </div>
                <progress
                  className="tt-monitor-progress__track"
                  value={data.scrapes.transform_progress_pct}
                  max={100}
                >
                  {data.scrapes.transform_progress_pct}%
                </progress>
                <p>
                  {formatNumber(data.scrapes.processed)} processed · {formatNumber(data.scrapes.pending)} pending · {formatNumber(data.scrapes.failed)} failed
                </p>
              </div>

              <DesignList density="compact" divider="hairline" paginate={false}>
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-list-check" tone={data.queue.failed > 0 ? 'danger' : 'accent'} />}
                  title={countSummary([
                    [data.queue.running, 'running'],
                    [data.queue.ready, 'ready'],
                    [data.queue.scheduled, 'scheduled'],
                    [data.queue.failed, 'failed'],
                  ])}
                  subtitle={data.queue.available ? `Graphile queue · ${formatNumber(data.queue.total)} monitored jobs` : 'Graphile queue is not available in this environment'}
                  hideChevron
                />
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-box-archive" tone={data.scrapes.failed > 0 ? 'danger' : 'success'} />}
                  title={`${formatNumber(data.scrapes.total)} payloads in this window`}
                  subtitle={`${data.scrapes.transform_success_pct}% transform success · latest ${timeLabel(data.scrapes.latest_scrape_at, 'not observed')}`}
                  hideChevron
                />
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-history" tone={data.pipeline_history.runs[0]?.status === 'failed' ? 'danger' : 'success'} />}
                  title={`${formatNumber(data.pipeline_history.total)} pipeline runs in this window`}
                  subtitle={data.pipeline_history.available ? `Run summaries retained for ${data.pipeline_history.retention_days} days` : 'Pipeline history is not available until the audit migration is deployed'}
                  hideChevron
                />
                <ListItem
                  leading={<IconCircle iconClassName="fa fa-bug" tone={data.active_resource_failures > 0 ? 'danger' : 'success'} />}
                  title={`${formatNumber(data.active_resource_failures)} source resources currently failing`}
                  subtitle={data.active_resource_failures > 0 ? 'Open the failure audit below for error details.' : 'No enabled source resource has consecutive failures.'}
                  hideChevron
                />
              </DesignList>
            </PageSection>

            <PageSection
              surface="flat"
              density="compact"
              title="Previous Runs"
              note={data.pipeline_history.available ? `${data.pipeline_history.total} runs · ${data.pipeline_history.retention_days}-day retention` : 'History unavailable'}
            >
              {!data.pipeline_history.available ? (
                <EmptyState iconClassName="fa fa-database" title="Run history not deployed" message="The live monitor still works; previous runs will appear after the audit migration and worker update are deployed." />
              ) : data.pipeline_history.runs.length === 0 ? (
                <EmptyState iconClassName="fa fa-history" title="No pipeline runs in this window" message="Run history begins with the first daily pipeline execution after deployment." />
              ) : (
                <div className="tt-monitor-runs">
                  {data.pipeline_history.runs.map((run) => {
                    const runMeta = pipelineRunStatusMeta(run.status);
                    const expanded = expandedRunKey === run.run_key;
                    return (
                      <div className="tt-monitor-run" key={run.run_key}>
                        <ListItem
                          leading={<IconCircle iconClassName={runMeta.icon} tone={runMeta.tone} />}
                          title={`Daily pipeline · ${run.run_key}`}
                          subtitle={`${formatDate(run.started_at, { includeTime: true })} · ${formatDuration(run.duration_ms)} · ${formatNumber(run.attempt_count)} stage executions`}
                          trailing={<Pill tone={runMeta.tone}>{runMeta.label}</Pill>}
                          onClick={() => setExpandedRunKey(expanded ? null : run.run_key)}
                        />
                        {expanded && (
                          <div className="tt-monitor-run__details">
                            <dl className="tt-monitor-run__facts">
                              <div>
                                <dt>Current stage</dt>
                                <dd>{pipelineStageLabel(run.current_stage)}</dd>
                              </div>
                              <div>
                                <dt>Run window</dt>
                                <dd>{formatDate(run.window_start, { includeTime: true })}</dd>
                              </div>
                              <div>
                                <dt>Finished</dt>
                                <dd>{timeLabel(run.finished_at, 'Still running')}</dd>
                              </div>
                            </dl>
                            {run.error_message && <p className="tt-monitor-run__error">{run.error_message}</p>}
                            <div className="tt-monitor-stages" aria-label={`Stages for run ${run.run_key}`}>
                              {run.stages.map((stage) => {
                                const stageMeta = pipelineStageStatusMeta(stage.status);
                                const summary = pipelineStageSummary(stage);
                                return (
                                  <div className="tt-monitor-stage" key={stage.stage}>
                                    <IconCircle iconClassName={stageMeta.icon} tone={stageMeta.tone} />
                                    <div className="tt-monitor-stage__content">
                                      <div className="tt-monitor-stage__heading">
                                        <strong>{pipelineStageLabel(stage.stage)}</strong>
                                        <Pill tone={stageMeta.tone}>{stageMeta.label}</Pill>
                                      </div>
                                      <p>{formatDuration(stage.duration_ms)} · {formatNumber(stage.attempt_count)} attempts</p>
                                      {summary && <p>{summary}</p>}
                                      {stage.error_message && <p className="tt-monitor-run__error">{stage.error_message}</p>}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </PageSection>

            <PageSection surface="flat" density="compact" title="Queue by Task" note={`${data.tasks.length} active task types`}>
              {data.tasks.length === 0 ? (
                <EmptyState iconClassName="fa fa-check" title="Queue is clear" message="No monitored scraping or pipeline tasks are waiting." />
              ) : (
                <DesignList density="compact" divider="hairline" paginate={false}>
                  {data.tasks.map((task) => (
                    <ListItem
                      key={task.task_identifier}
                      leading={<IconCircle iconClassName={task.failed > 0 ? 'fa fa-exclamation' : task.running > 0 ? 'fa fa-sync fa-spin' : 'fa fa-layer-group'} tone={task.failed > 0 ? 'danger' : task.running > 0 ? 'accent' : 'neutral'} />}
                      title={taskLabel(task.task_identifier)}
                      subtitle={`${countSummary([[task.running, 'running'], [task.ready, 'ready'], [task.scheduled, 'scheduled'], [task.failed, 'failed']])}${task.latest_error ? ` · ${task.latest_error}` : ''}`}
                      trailing={<Pill tone={task.failed > 0 ? 'danger' : task.running > 0 ? 'accent' : 'neutral'}>{formatNumber(task.total)}</Pill>}
                    />
                  ))}
                </DesignList>
              )}
            </PageSection>

            <PageSection surface="flat" density="compact" title="Queue Audit" note={`${data.recent_jobs.length} current jobs`}>
              {data.recent_jobs.length === 0 ? (
                <EmptyState iconClassName="fa fa-inbox" title="No queued jobs" message="Completed Graphile jobs are removed from the queue; completed pipeline runs remain in Previous Runs." />
              ) : (
                <DesignList density="compact" divider="hairline" pageSize={12}>
                  {data.recent_jobs.map((job) => {
                    const jobMeta = queueStateMeta(job.state);
                    return (
                      <ListItem
                        key={job.id}
                        leading={<IconCircle iconClassName={jobMeta.icon} tone={jobMeta.tone} />}
                        title={taskLabel(job.task_identifier)}
                        subtitle={`${jobMeta.label} · attempt ${job.attempts}/${job.max_attempts} · updated ${formatDate(job.updated_at, { includeTime: true })}${job.last_error ? ` · ${job.last_error}` : ''}`}
                        trailing={<Pill tone={jobMeta.tone}>{jobMeta.label}</Pill>}
                      />
                    );
                  })}
                </DesignList>
              )}
            </PageSection>

            <PageSection surface="flat" density="compact" title="Recent Results" note={`${data.recent_scrapes.length} payloads`}>
              {data.recent_scrapes.length === 0 ? (
                <EmptyState iconClassName="fa fa-database" title="No payloads in this window" message="Choose a longer window or wait for the next scrape run." />
              ) : (
                <DesignList density="compact" divider="hairline" pageSize={15}>
                  {data.recent_scrapes.map((scrape) => {
                    const scrapeMeta = scrapeStatusMeta(scrape.status);
                    return (
                      <ListItem
                        key={scrape.id}
                        leading={<IconCircle iconClassName={scrapeMeta.icon} tone={scrapeMeta.tone} />}
                        title={endpointLabel(scrape.endpoint_url)}
                        subtitle={`${scrape.platform_name} · ${formatBytes(scrape.payload_bytes)} · ${formatDate(scrape.scraped_at, { includeTime: true })}`}
                        trailing={<Pill tone={scrapeMeta.tone}>{scrapeMeta.label}</Pill>}
                        onClick={() => window.open(scrape.endpoint_url, '_blank', 'noopener,noreferrer')}
                      />
                    );
                  })}
                </DesignList>
              )}
            </PageSection>

            <PageSection surface="flat" density="compact" title="Failure Audit" note={`${data.resource_failures.length} shown · ${data.active_resource_failures} total`}>
              {data.resource_failures.length === 0 ? (
                <EmptyState iconClassName="fa fa-shield-check" title="No active source failures" message="All enabled registered resources currently have a clean failure count." />
              ) : (
                <DesignList density="compact" divider="hairline" pageSize={10}>
                  {data.resource_failures.map((failure) => (
                    <ListItem
                      key={failure.id}
                      leading={<IconCircle iconClassName="fa fa-bug" tone="danger" />}
                      title={`${failure.platform_name} · ${failure.resource_name}`}
                      subtitle={`${failure.source_instance_name} · ${failure.resource_type} · ${failure.consecutive_failures} consecutive failures · ${failure.last_error}`}
                      trailing={<Pill tone="danger">{failure.consecutive_failures}</Pill>}
                      hideChevron={!failure.public_url}
                      onClick={failure.public_url ? () => window.open(failure.public_url!, '_blank', 'noopener,noreferrer') : undefined}
                    />
                  ))}
                </DesignList>
              )}
            </PageSection>

            <p className="tt-section-meta tt-monitor-generated">
              Generated {formatDate(data.generated_at, { includeTime: true })}. Pipeline summaries are retained for 14 days; scraped payload content is not duplicated in run history.
            </p>
          </>
        )}
      </AppPageContent>
    </AppShellPage>
  );
}
