import { useQuery } from '@tanstack/react-query';
import { API_BASE_URL } from '../player-shared';

export type ManualTournamentSubmissionStatus = 'processing' | 'published' | 'merged' | 'failed';

export interface ManualTournamentSubmissionItem {
  submission_id: string;
  competition_id: string;
  status: ManualTournamentSubmissionStatus;
  status_message: string | null;
  submitted_at: string;
  source_url: string;
  name: string | null;
  start_date: string | null;
  venue_name: string | null;
  venue_town: string | null;
  venue_postcode: string | null;
  category: string | null;
  event_status: string;
}

interface ManualTournamentSubmissionsResponse {
  data: ManualTournamentSubmissionItem[];
}

async function fetchManualTournamentSubmissions(accessToken: string): Promise<ManualTournamentSubmissionsResponse> {
  const response = await fetch(`${API_BASE_URL}/events/manual-submissions`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  const payload = await response.json() as ManualTournamentSubmissionsResponse & { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `HTTP ${response.status}`);
  }
  return payload;
}

export function useManualTournamentSubmissions(accessToken: string | null | undefined, enabled = true) {
  const query = useQuery({
    queryKey: ['events', 'manual-submissions', accessToken ? 'signed-in' : 'signed-out'],
    queryFn: () => fetchManualTournamentSubmissions(accessToken!),
    enabled: Boolean(accessToken) && enabled,
    refetchInterval: (currentQuery) => {
      const data = currentQuery.state.data as ManualTournamentSubmissionsResponse | undefined;
      return data?.data.some((submission) => submission.status === 'processing') ? 3_000 : false;
    },
  });

  return {
    items: query.data?.data ?? [],
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error instanceof Error ? query.error.message : query.error ? 'Could not load submissions.' : null,
    retry: query.refetch,
  };
}
