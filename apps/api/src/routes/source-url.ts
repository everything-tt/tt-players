import { type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

interface SourceContext {
    competitionExternalId: string;
    seasonExternalId: string;
    leagueExternalId: string;
    platformBaseUrl: string;
}

function isTT365(baseUrl: string): boolean {
    return baseUrl.toLowerCase().includes('tabletennis365');
}

function isTTLeagues(baseUrl: string): boolean {
    return baseUrl.toLowerCase().includes('ttleagues');
}

export async function resolveCompetitionSourceUrl(
    _db: Kysely<Database>,
    context: SourceContext,
    _preferredBefore: Date | null,
): Promise<string | null> {
    const { platformBaseUrl, competitionExternalId, seasonExternalId, leagueExternalId } = context;
    const leaguePath = leagueExternalId.replace(/-tt365$/, '');

    if (isTTLeagues(platformBaseUrl)) {
        return `${platformBaseUrl}/api/divisions/${competitionExternalId}/standings`;
    }

    if (isTT365(platformBaseUrl)) {
        return `${platformBaseUrl}/${leaguePath}/Tables/${seasonExternalId}/${competitionExternalId}`;
    }

    return null;
}

export async function resolveFixtureSourceUrl(
    _db: Kysely<Database>,
    fixtureExternalId: string,
    context: SourceContext,
    _preferredBefore: Date | null,
): Promise<string | null> {
    const { platformBaseUrl, seasonExternalId, leagueExternalId } = context;
    const leaguePath = leagueExternalId.replace(/-tt365$/, '');

    if (isTT365(platformBaseUrl)) {
        return `${platformBaseUrl}/${leaguePath}/Results/MatchCard/${seasonExternalId}/${fixtureExternalId}`;
    }

    if (isTTLeagues(platformBaseUrl)) {
        return `${platformBaseUrl}/api/matches/${fixtureExternalId}/sets`;
    }

    return null;
}
