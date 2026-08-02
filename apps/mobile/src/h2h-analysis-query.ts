import { useQuery } from '@tanstack/react-query';
import { apiFetch } from './player-shared';
import type { H2HAnalysisResponse } from './h2h-analysis-types';

export function useH2HAnalysisQuery(playerId1: string, playerId2: string, enabled = true) {
  return useQuery({
    queryKey: ['players', 'h2h', playerId1, playerId2, 'analysis', { commonLimit: 5 }],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiFetch<H2HAnalysisResponse>(
        `/players/${playerId1}/h2h/${playerId2}/analysis?common_limit=5`,
        signal,
      ),
    enabled: enabled && Boolean(playerId1) && Boolean(playerId2),
  });
}
