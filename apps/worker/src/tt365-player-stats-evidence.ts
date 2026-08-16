import { sql, type Kysely } from 'kysely';
import {
    parseTT365MatchCard,
    parseTT365PlayerResultsForMatch,
    parseTT365PlayerStatsTargets,
    type TT365PlayerStatsTarget,
} from './tt365-parser.js';

export const TT365_PLAYER_STATS_EVIDENCE_TYPE = 'tt365-playerstats';

type ParsedMatchCard = ReturnType<typeof parseTT365MatchCard>;
type ParsedRubber = ParsedMatchCard['rubbers'][number];

export interface TT365PlayerStatsEvidenceDependency extends TT365PlayerStatsTarget {
    requirementKey: string;
    evidenceLogId: string | null;
    evidencePayload: string | null;
    ready: boolean;
}

type TT365FallbackStatsResult = {
    playerExternalId: string;
    opponentExternalId: string;
    playerGamesWon: number;
    opponentGamesWon: number;
};

export function tt365PlayerStatsRequirementKey(
    target: Pick<TT365PlayerStatsTarget, 'seasonToken' | 'playerExternalId'>,
): string {
    return `${target.seasonToken}|${target.playerExternalId}`;
}

export async function ensureTT365PlayerStatsEvidenceDependencies(
    database: Kysely<any>,
    parentLogId: string,
    rawMatchCardHtml: string,
    matchCardUrl: string,
): Promise<TT365PlayerStatsEvidenceDependency[]> {
    const targets = parseTT365PlayerStatsTargets(rawMatchCardHtml, matchCardUrl)
        .map((target) => ({
            ...target,
            requirementKey: tt365PlayerStatsRequirementKey(target),
        }))
        .sort((a, b) => a.requirementKey.localeCompare(b.requirementKey));

    if (targets.length === 0) return [];

    await database
        .insertInto('staging.raw_scrape_evidence_dependencies')
        .values(targets.map((target) => ({
            parent_log_id: parentLogId,
            evidence_type: TT365_PLAYER_STATS_EVIDENCE_TYPE,
            requirement_key: target.requirementKey,
            endpoint_url: target.url,
            status: 'pending',
            updated_at: new Date(),
        })))
        .onConflict((conflict) =>
            conflict
                .columns(['parent_log_id', 'evidence_type', 'requirement_key'])
                .doUpdateSet({
                    endpoint_url: sql`excluded.endpoint_url`,
                    updated_at: new Date(),
                }),
        )
        .execute();

    const rows = await database
        .selectFrom('staging.raw_scrape_evidence_dependencies as dependency')
        .leftJoin(
            'staging.raw_scrape_logs as evidence',
            'evidence.id',
            'dependency.evidence_log_id',
        )
        .select([
            'dependency.requirement_key as requirementKey',
            'dependency.evidence_log_id as evidenceLogId',
            'dependency.status as dependencyStatus',
            'evidence.raw_payload as evidencePayload',
            'evidence.status as evidenceStatus',
        ])
        .where('dependency.parent_log_id', '=', parentLogId)
        .where('dependency.evidence_type', '=', TT365_PLAYER_STATS_EVIDENCE_TYPE)
        .execute();

    const byRequirement = new Map(
        rows.map((row: any) => [row.requirementKey, row]),
    );

    return targets.map((target) => {
        const row: any = byRequirement.get(target.requirementKey);
        const evidencePayload = row?.evidencePayload ?? null;
        const evidenceLogId = row?.evidenceLogId ?? null;
        return {
            ...target,
            evidenceLogId,
            evidencePayload,
            ready:
                row?.dependencyStatus === 'processed'
                && row?.evidenceStatus === 'processed'
                && evidenceLogId !== null
                && evidencePayload !== null,
        };
    });
}

export async function pinTT365PlayerStatsEvidence(
    database: Kysely<any>,
    parentLogId: string,
    requirementKey: string,
    evidenceLogId: string,
): Promise<boolean> {
    return database.transaction().execute(async (transaction) => {
        // Serialize evidence pinning against parent completion. If the parent
        // wins the row lock first and completes, late evidence cannot mutate
        // the evidence set that produced canonical output.
        const parent = await transaction
            .selectFrom('staging.raw_scrape_logs')
            .select(['status', 'platform_id'])
            .where('id', '=', parentLogId)
            .forUpdate()
            .executeTakeFirst();

        if (!parent || parent.status === 'processed') return false;

        const result = await sql<{ id: string }>`
            UPDATE staging.raw_scrape_evidence_dependencies AS dependency
            SET
                evidence_log_id = ${evidenceLogId},
                status = 'processed',
                updated_at = now()
            FROM staging.raw_scrape_logs AS evidence
            WHERE dependency.parent_log_id = ${parentLogId}
              AND dependency.evidence_type = ${TT365_PLAYER_STATS_EVIDENCE_TYPE}
              AND dependency.requirement_key = ${requirementKey}
              AND evidence.id = ${evidenceLogId}
              AND evidence.platform_id = ${parent.platform_id}
              AND evidence.endpoint_url = dependency.endpoint_url
            RETURNING dependency.id
        `.execute(transaction);

        return result.rows.length === 1;
    });
}

function isUsablePlayerStatsScore(
    homeGamesWon: number,
    awayGamesWon: number,
): boolean {
    return homeGamesWon >= 0
        && awayGamesWon >= 0
        && homeGamesWon <= 3
        && awayGamesWon <= 3
        && homeGamesWon !== awayGamesWon;
}

function findFallbackRubberScore(
    rubber: ParsedRubber,
    lookup: Map<string, TT365FallbackStatsResult>,
): { homeGamesWon: number; awayGamesWon: number } | null {
    for (const homePlayerExternalId of rubber.homePlayers) {
        for (const awayPlayerExternalId of rubber.awayPlayers) {
            const direct = lookup.get(`${homePlayerExternalId}|${awayPlayerExternalId}`);
            if (direct) {
                return {
                    homeGamesWon: direct.playerGamesWon,
                    awayGamesWon: direct.opponentGamesWon,
                };
            }

            const reverse = lookup.get(`${awayPlayerExternalId}|${homePlayerExternalId}`);
            if (reverse) {
                return {
                    homeGamesWon: reverse.opponentGamesWon,
                    awayGamesWon: reverse.playerGamesWon,
                };
            }
        }
    }
    return null;
}

export function applyTT365PlayerStatsEvidenceFallback(
    parsed: ParsedMatchCard,
    matchExternalId: string,
    dependencies: TT365PlayerStatsEvidenceDependency[],
): { parsed: ParsedMatchCard; replacements: number } {
    const lookup = new Map<string, TT365FallbackStatsResult>();

    for (const dependency of dependencies) {
        if (!dependency.ready || dependency.evidencePayload === null) continue;

        const rows = parseTT365PlayerResultsForMatch(
            dependency.evidencePayload,
            matchExternalId,
        );
        for (const row of rows) {
            if (parsed.fixture.datePlayed && row.matchDate !== parsed.fixture.datePlayed) {
                continue;
            }
            if (!isUsablePlayerStatsScore(row.playerGamesWon, row.opponentGamesWon)) {
                continue;
            }

            const key = `${dependency.playerExternalId}|${row.opponentExternalId}`;
            if (!lookup.has(key)) {
                lookup.set(key, {
                    playerExternalId: dependency.playerExternalId,
                    opponentExternalId: row.opponentExternalId,
                    playerGamesWon: row.playerGamesWon,
                    opponentGamesWon: row.opponentGamesWon,
                });
            }
        }
    }

    let replacements = 0;
    const rubbers = parsed.rubbers.map((rubber) => {
        const fallback = findFallbackRubberScore(rubber, lookup);
        if (!fallback) return rubber;
        replacements += 1;
        return {
            ...rubber,
            homeGamesWon: fallback.homeGamesWon,
            awayGamesWon: fallback.awayGamesWon,
        };
    });

    return {
        parsed: { ...parsed, rubbers },
        replacements,
    };
}
