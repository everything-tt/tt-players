import type { Match } from './zod-schemas.js';

export interface ExistingFixtureState {
    external_id: string;
    status: string;
    updated_at: Date | string;
}

export function selectMatchesNeedingResults(
    matches: readonly Match[],
    existingFixtures: readonly ExistingFixtureState[],
    nowMs: number,
    staleAfterMs: number,
): Match[] {
    const existingById = new Map(
        existingFixtures.map((fixture) => [fixture.external_id, fixture]),
    );

    return matches.filter((match) => {
        if (!match.hasResults) return false;

        const fixture = existingById.get(String(match.id));
        if (!fixture || fixture.status !== 'completed') return true;

        const updatedAtMs = new Date(fixture.updated_at).getTime();
        return Number.isNaN(updatedAtMs) || nowMs - updatedAtMs >= staleAfterMs;
    });
}
