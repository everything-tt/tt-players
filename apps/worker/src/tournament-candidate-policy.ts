const DEFAULT_TOURNAMENT_CANDIDATE_LIMIT = 50;
const MAX_TOURNAMENT_CANDIDATE_LIMIT = 200;

export function tournamentCandidateLimit(
    raw: string | undefined = process.env['TOURNAMENT_CANDIDATE_LIMIT'],
): number {
    if (raw === undefined || raw.trim() === '') return DEFAULT_TOURNAMENT_CANDIDATE_LIMIT;
    const value = Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        return DEFAULT_TOURNAMENT_CANDIDATE_LIMIT;
    }
    return Math.min(value, MAX_TOURNAMENT_CANDIDATE_LIMIT);
}

export const TOURNAMENT_CANDIDATE_LIMIT_MAX = MAX_TOURNAMENT_CANDIDATE_LIMIT;
