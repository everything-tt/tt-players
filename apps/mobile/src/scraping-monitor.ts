import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './player-shared';

export type ScrapingMonitorState = 'attention' | 'running' | 'scheduled' | 'idle' | 'unobserved';
export type QueueJobState = 'running' | 'ready' | 'scheduled' | 'failed';
export type ScrapeStatus = 'pending' | 'processed' | 'failed';
export type PipelineRunStatus = 'running' | 'completed' | 'failed';
export type PipelineStageStatus = 'running' | 'waiting' | 'completed' | 'failed';

export interface ScrapingQueueSummary {
  available: boolean;
  total: number;
  running: number;
  ready: number;
  scheduled: number;
  failed: number;
  oldest_pending_at: string | null;
}

export interface ScrapeWindowSummary {
  total: number;
  pending: number;
  processed: number;
  failed: number;
  transform_progress_pct: number;
  transform_success_pct: number;
  latest_scrape_at: string | null;
}

export interface ScrapingQueueTask {
  task_identifier: string;
  total: number;
  running: number;
  ready: number;
  scheduled: number;
  failed: number;
  oldest_created_at: string | null;
  latest_updated_at: string | null;
  latest_error: string | null;
}

export interface ScrapingQueueJob {
  id: string;
  task_identifier: string;
  state: QueueJobState;
  attempts: number;
  max_attempts: number;
  created_at: string;
  updated_at: string;
  run_at: string;
  locked_at: string | null;
  last_error: string | null;
}

export interface RecentScrape {
  id: string;
  platform_name: string;
  endpoint_url: string;
  status: ScrapeStatus;
  scraped_at: string;
  payload_bytes: number;
}

export interface ScrapingResourceFailure {
  id: string;
  platform_name: string;
  source_instance_name: string;
  resource_type: string;
  resource_name: string;
  public_url: string | null;
  consecutive_failures: number;
  last_fetched_at: string | null;
  last_succeeded_at: string | null;
  updated_at: string;
  last_error: string;
}

export interface ScrapingPipelineStage {
  stage: string;
  status: PipelineStageStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  attempt_count: number;
  summary: Record<string, unknown>;
  error_message: string | null;
}

export interface ScrapingPipelineRun {
  run_key: string;
  status: PipelineRunStatus;
  current_stage: string;
  window_start: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  attempt_count: number;
  error_message: string | null;
  stages: ScrapingPipelineStage[];
}

export interface ScrapingPipelineHistory {
  available: boolean;
  retention_days: number;
  total: number;
  runs: ScrapingPipelineRun[];
}

export interface ScrapingMonitorResponse {
  generated_at: string;
  window_hours: number;
  state: ScrapingMonitorState;
  queue: ScrapingQueueSummary;
  scrapes: ScrapeWindowSummary;
  pipeline_history: ScrapingPipelineHistory;
  active_resource_failures: number;
  tasks: ScrapingQueueTask[];
  recent_jobs: ScrapingQueueJob[];
  recent_scrapes: RecentScrape[];
  resource_failures: ScrapingResourceFailure[];
}

export function useScrapingMonitorQuery(hours: number) {
  return useQuery({
    queryKey: ['scraping', 'monitor', hours],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiFetch<ScrapingMonitorResponse>(`/scraping/monitor?hours=${hours}&limit=40`, signal),
    staleTime: 5_000,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false,
  });
}
