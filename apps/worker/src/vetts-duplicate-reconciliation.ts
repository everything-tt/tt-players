import { sql, type Kysely } from 'kysely';
import type { VettsMatchResult } from './vetts-parser.js';
import { VETTS_SOURCE } from './vetts-loader.js';

export interface DuplicateCandidate {
    id: string;
    home_name: string;
    away_name: string;
    home_games_won: number;
    away_games_won: number;
    outcome_type: string;
}

export interface VettsDuplicateReconciliationResult {
    linked: number;
    conflicts: number;
    unmatched: number;
}

function normalizeName(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function vettsDuplicateCandidateMatches(match: VettsMatchResult, candidate: DuplicateCandidate): boolean {
    const incomingHome = normalizeName(match.homePlayers[0]?.name ?? '');
    const incomingAway = normalizeName(match.awayPlayers[0]?.name ?? '');
    const candidateHome = normalizeName(candidate.home_name);
    const candidateAway = normalizeName(candidate.away_name);
    const sameOrientation = incomingHome === candidateHome && incomingAway === candidateAway;
    const reversed = incomingHome === candidateAway && incomingAway === candidateHome;
    if (!sameOrientation && !reversed) return false;

    const candidateWinner = candidate.home_games_won > candidate.away_games_won ? 'home' : 'away';
    const adjustedWinner = reversed ? (candidateWinner === 'home' ? 'away' : 'home') : candidateWinner;
    if (adjustedWinner !== match.winnerSide) return false;
    if (candidate.outcome_type !== match.outcomeType) return false;

    if (match.scoreSource === 'games') {
        const expectedHome = reversed ? candidate.away_games_won : candidate.home_games_won;
        const expectedAway = reversed ? candidate.home_games_won : candidate.away_games_won;
        return expectedHome === match.homeGamesWon && expectedAway === match.awayGamesWon;
    }
    return true;
}

async function candidatesForMatch(
    database: Kysely<any>,
    match: VettsMatchResult,
): Promise<DuplicateCandidate[]> {
    if (match.isDoubles || !match.playedAt) return [];
    const homeName = match.homePlayers[0]?.name ?? '';
    const awayName = match.awayPlayers[0]?.name ?? '';

    const result = await sql<DuplicateCandidate>`
        select
            r.id,
            hp.name as home_name,
            ap.name as away_name,
            r.home_games_won,
            r.away_games_won,
            r.outcome_type
        from rubbers r
        join fixtures f on f.id = r.fixture_id
        join external_players hp on hp.id = r.home_player_1_id
        join external_players ap on ap.id = r.away_player_1_id
        where r.external_id <> ${match.externalId}
          and r.external_id not like 'vetts:match:%'
          and r.deleted_at is null
          and coalesce(r.played_at::date, f.date_played::date) = ${match.playedAt.slice(0, 10)}::date
          and (
              (
                  regexp_replace(lower(hp.name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(${homeName}), '[^a-z0-9]+', '', 'g')
                  and regexp_replace(lower(ap.name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(${awayName}), '[^a-z0-9]+', '', 'g')
              )
              or
              (
                  regexp_replace(lower(hp.name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(${awayName}), '[^a-z0-9]+', '', 'g')
                  and regexp_replace(lower(ap.name), '[^a-z0-9]+', '', 'g') = regexp_replace(lower(${homeName}), '[^a-z0-9]+', '', 'g')
              )
          )
        limit 10
    `.execute(database);
    return result.rows;
}

async function linkSourceRow(
    database: Kysely<any>,
    sourceRowId: string,
    canonicalRubberId: string,
): Promise<void> {
    await database
        .updateTable('staging.source_event_result_rows')
        .set({ canonical_rubber_id: canonicalRubberId, updated_at: new Date() })
        .where('id', '=', sourceRowId)
        .execute();
}

async function makeIncomingEffective(
    database: Kysely<any>,
    incomingRubberId: string,
): Promise<void> {
    await database
        .updateTable('rubbers')
        .set({ deleted_at: null, updated_at: new Date() })
        .where('id', '=', incomingRubberId)
        .execute();
}

export async function reconcileVettsDuplicateRubbers(
    database: Kysely<any>,
    competitionId: string,
    matches: VettsMatchResult[],
): Promise<VettsDuplicateReconciliationResult> {
    let linked = 0;
    let conflicts = 0;
    let unmatched = 0;

    for (const match of matches) {
        const sourceRow = await database
            .selectFrom('staging.source_event_result_rows')
            .select('id')
            .where('source', '=', VETTS_SOURCE)
            .where('external_id', '=', match.externalId)
            .executeTakeFirst();
        const incomingRubber = await database
            .selectFrom('rubbers as rubber')
            .innerJoin('fixtures as fixture', 'fixture.id', 'rubber.fixture_id')
            .select('rubber.id')
            .where('fixture.competition_id', '=', competitionId)
            .where('rubber.external_id', '=', match.externalId)
            .executeTakeFirst();
        if (!sourceRow || !incomingRubber) {
            unmatched += 1;
            continue;
        }

        if (match.isDoubles) {
            await makeIncomingEffective(database, incomingRubber.id);
            await linkSourceRow(database, sourceRow.id, incomingRubber.id);
            unmatched += 1;
            continue;
        }

        const candidates = await candidatesForMatch(database, match);
        const exact = candidates.filter((candidate) => vettsDuplicateCandidateMatches(match, candidate));
        if (exact.length === 1) {
            await linkSourceRow(database, sourceRow.id, exact[0]!.id);
            await database
                .updateTable('rubbers')
                .set({ deleted_at: new Date(), updated_at: new Date() })
                .where('id', '=', incomingRubber.id)
                .execute();
            linked += 1;
            continue;
        }

        await makeIncomingEffective(database, incomingRubber.id);
        await linkSourceRow(database, sourceRow.id, incomingRubber.id);

        if (candidates.length > 0) {
            await database
                .updateTable('staging.source_event_result_rows')
                .set({
                    raw_payload: sql`raw_payload || ${JSON.stringify({
                        duplicateReview: {
                            reason: exact.length > 1 ? 'ambiguous' : 'score-conflict',
                            candidateRubberIds: candidates.map((candidate) => candidate.id),
                        },
                    })}::jsonb`,
                    updated_at: new Date(),
                })
                .where('id', '=', sourceRow.id)
                .execute();
            conflicts += 1;
            continue;
        }

        unmatched += 1;
    }

    return { linked, conflicts, unmatched };
}
