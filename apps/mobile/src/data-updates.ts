import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './player-shared';

export type DataUpdateRunStatus = 'running' | 'completed' | 'failed';
export type DataUpdateStageStatus = 'running' | 'waiting' | 'completed' | 'failed';

export interface DataUpdateStage {
  stage: string;
  status: DataUpdateStageStatus;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  attempt_count: number;
  summary: Record<string, unknown>;
  recorded_at: string;
}

export interface DataUpdateRun {
  run_key: string;
  status: DataUpdateRunStatus;
  current_stage: string;
  window_start: string;
  started_at: string;
  finished_at: string | null;
  duration_ms: number | null;
  attempt_count: number;
  recorded_at: string;
  stages: DataUpdateStage[];
}

export interface DataUpdatesResponse {
  generated_at: string;
  available: boolean;
  latest_recorded_at: string | null;
  run: DataUpdateRun | null;
}

export function useDataUpdatesQuery() {
  return useQuery({
    queryKey: ['sources', 'updates'],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiFetch<DataUpdatesResponse>('/sources/updates', signal),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
}
