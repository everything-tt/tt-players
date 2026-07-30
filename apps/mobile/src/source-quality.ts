import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './player-shared';

export type SourceHealth = 'healthy' | 'degraded' | 'unobserved';

export interface SourceQualityItem {
  platform_id: string;
  name: string;
  base_url: string;
  health: SourceHealth;
  leagues: number;
  competitions: number;
  fixtures: number;
  rubbers: number;
  dated_rubbers_pct: number;
  full_score_rubbers_pct: number;
  missing_player_rubbers: number;
  external_players: number;
  canonical_players: number;
  total_scrapes: number;
  failed_scrapes: number;
  source_instances: number;
  source_resources: number;
  unhealthy_resources: number;
  latest_activity_at: string | null;
  last_error: string | null;
}

export interface SourceQualityResponse {
  generated_at: string;
  summary: {
    providers: number;
    healthy: number;
    degraded: number;
    unobserved: number;
    leagues: number;
    competitions: number;
    canonical_players: number;
    rubbers: number;
    dated_rubbers_pct: number;
    full_score_rubbers_pct: number;
    missing_player_rubbers: number;
    pending_identity_suggestions: number;
    unhealthy_resources: number;
  };
  sources: SourceQualityItem[];
}

export function useSourceQualityQuery() {
  return useQuery({
    queryKey: ['sources', 'quality'],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiFetch<SourceQualityResponse>('/sources/quality', signal),
    staleTime: 5 * 60 * 1000,
  });
}
