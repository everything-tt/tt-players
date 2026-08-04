import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { chooseTournamentCandidate } from './tournament-reconciliation.js';
import type { VettsMatchResult, VettsTournamentMetadata } from './vetts-parser.js';

export const VETTS_PLATFORM_NAME = 'Tournament Software';
export const VETTS_PLATFORM_BASE_URL = 'https://www.tournamentsoftware.com';
export const VETTS_LEAGUE_EXTERNAL_ID = 'vetts';
export const VETTS_LEAGUE_NAME = 'Veterans English Table Tennis Society';
export const VETTS_CATEGORY = 'Veterans';
export const VETTS_SOURCE = 'vetts-tournamentsoftware';

export interface VettsCompetitionResolution {
    competitionId: string;
    matchMethod: 'existing-source' | 'automatic' | 'review' | 'separate';
}

export function deriveVettsEventStatus(
    metadata: Pick<VettsTournamentMetadata, 'startDate' | 'endDate'>,
    now: Date = new Date(),
): 'upcoming' | 'in_progress' | 'completed' {
    if (!metadata.startDate) return 'completed';
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const start = Date.parse(`${metadata.startDate}T00:00:00Z`);
    const end = Date.parse(`${metadata.endDate ?? metadata.startDate}T23:59:59Z`);
    if (Number.isNaN(start) || Number.isNaN(end)) return 'completed';
    if (today < start) return 'upcoming';
    if (today <= end) return 'in_progress';
    return 'completed';
}

export async function upsertVettsPlatform(db: Kysely<Database>): Promise<string> {
    const existing = await db
        .selectFrom('platforms')
        .select('id')
        .where('base_url', '=', VETTS_PLATFORM_BASE_URL)
        .executeTakeFirst();
    if (existing) return existing.id;

    return db
        .insertInto('platforms')
        .values({ name: VETTS_PLATFORM_NAME, base_url: VETTS_PLATFORM_BASE_URL })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row) => row.id);
}

export async function upsertVettsLeague(
    db: Kysely<Database>,
    platformId: string,
): Promise<string> {
    const existing = await db
        .selectFrom('leagues')
        .select('id')
        .where('platform_id', '=', platformId)
        .where('external_id', '=', VETTS_LEAGUE_EXTERNAL_ID)
        .executeTakeFirst();
    if (existing) return existing.id;

    return db
        .insertInto('leagues')
        .values({
            platform_id: platformId,
            external_id: VETTS_LEAGUE_EXTERNAL_ID,
            name: VETTS_LEAGUE_NAME,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row) => row.id);
}

export async function upsertVettsSeason(
    db: Kysely<Database>,
    leagueId: string,
    startDate: string | null,
): Promise<string> {
    const year = startDate?.match(/^(\d{4})/)?.[1] ?? 'unknown';
    const externalId = `vetts-${year}`;
    const name = year === 'unknown' ? 'VETTS Unknown Season' : `VETTS ${year}`;
    const existing = await db
        .selectFrom('seasons')
        .select('id')
        .where('league_id', '=', leagueId)
        .where('external_id', '=', externalId)
        .executeTakeFirst();
    if (existing) return existing.id;

    return db
        .insertInto('seasons')
        .values({ league_id: leagueId, external_id: externalId, name, is_active: year !== 'unknown' })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row) => row.id);
}

async function findCalendarCandidates(
    database: Kysely<any>,
    metadata: VettsTournamentMetadata,
): Promise<Array<{
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    venue: string | null;
    category: string | null;
}>> {
    let query = database
        .selectFrom('competitions')
        .select([
            'id',
            sql<string>`coalesce(display_name, name)`.as('name'),
            sql<string | null>`start_date::text`.as('startDate'),
            sql<string | null>`end_date::text`.as('endDate'),
            sql<string | null>`nullif(concat_ws(' ', venue_name, venue_town, venue_postcode), '')`.as('venue'),
            sql<string | null>`coalesce(
                category,
                case
                    when lower(coalesce(display_name, name)) ~ '(vetts|veteran)'
                    then ${VETTS_CATEGORY}
                    else null
                end
            )`.as('category'),
        ])
        .where('type', '=', 'individual')
        .where('source', '=', 'tte-calendar')
        .where('deleted_at', 'is', null);

    if (metadata.startDate) {
        query = query
            .where('start_date', '>=', sql<Date>`${metadata.startDate}::date - interval '7 days'`)
            .where('start_date', '<=', sql<Date>`${metadata.startDate}::date + interval '7 days'`);
    }

    return query.limit(50).execute();
}

async function saveTournamentSource(
    database: Kysely<any>,
    competitionId: string,
    metadata: VettsTournamentMetadata,
    matchMethod: string,
    matchConfidence: number | null,
): Promise<void> {
    const now = new Date();
    await database
        .insertInto('tournament_sources')
        .values({
            competition_id: competitionId,
            provider: 'vetts',
            source_type: 'results',
            external_id: metadata.tournamentId,
            source_url: metadata.sourceUrl,
            source_key: metadata.tournamentId,
            raw_payload: metadata,
            first_seen_at: now,
            last_seen_at: now,
            missing_count: 0,
            match_method: matchMethod,
            match_confidence: matchConfidence,
            created_at: now,
            updated_at: now,
        })
        .onConflict((conflict) =>
            conflict.columns(['provider', 'source_type', 'source_key']).doUpdateSet({
                competition_id: competitionId,
                external_id: metadata.tournamentId,
                source_url: metadata.sourceUrl,
                raw_payload: metadata,
                last_seen_at: now,
                missing_count: 0,
                match_method: matchMethod,
                match_confidence: matchConfidence,
                updated_at: now,
            }),
        )
        .execute();
}

async function recordReviewCandidate(
    database: Kysely<any>,
    metadata: VettsTournamentMetadata,
    candidate: { id: string; venue: string | null },
    score: { name: number; date: number; venue: number; category: number; total: number },
): Promise<void> {
    const existing = await database
        .selectFrom('tournament_match_candidates')
        .select('id')
        .where('incoming_provider', '=', 'vetts')
        .where('incoming_external_id', '=', metadata.tournamentId)
        .where('candidate_competition_id', '=', candidate.id)
        .where('status', '=', 'pending')
        .executeTakeFirst();
    if (existing) return;

    await database
        .insertInto('tournament_match_candidates')
        .values({
            incoming_provider: 'vetts',
            incoming_external_id: metadata.tournamentId,
            incoming_name: metadata.name,
            incoming_date: metadata.startDate,
            incoming_venue: [metadata.venueName, metadata.venueTown, metadata.venuePostcode]
                .filter(Boolean)
                .join(' ') || null,
            candidate_competition_id: candidate.id,
            name_score: score.name,
            date_score: score.date,
            venue_score: score.venue,
            category_score: score.category,
            total_score: score.total,
            status: 'pending',
        })
        .execute();
}

async function upsertSeparateCompetition(
    database: Kysely<any>,
    seasonId: string,
    metadata: VettsTournamentMetadata,
): Promise<string> {
    const externalId = `vetts:tournament:${metadata.tournamentId}`;
    const existing = await database
        .selectFrom('competitions')
        .select('id')
        .where('external_id', '=', externalId)
        .executeTakeFirst();

    const values = {
        name: metadata.name,
        display_name: metadata.name,
        event_date: metadata.startDate,
        start_date: metadata.startDate,
        end_date: metadata.endDate,
        venue_name: metadata.venueName,
        venue_address: metadata.venueAddress,
        venue_town: metadata.venueTown,
        venue_postcode: metadata.venuePostcode,
        category: VETTS_CATEGORY,
        source: 'vetts',
        source_url: metadata.sourceUrl,
        event_status: deriveVettsEventStatus(metadata),
        deleted_at: null,
    } as const;

    if (existing) {
        await database.updateTable('competitions').set(values).where('id', '=', existing.id).execute();
        return existing.id;
    }

    return database
        .insertInto('competitions')
        .values({
            season_id: seasonId,
            external_id: externalId,
            type: 'individual',
            ...values,
        })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row: { id: string }) => row.id);
}

export async function resolveVettsCompetition(
    database: Kysely<any>,
    seasonId: string,
    metadata: VettsTournamentMetadata,
): Promise<VettsCompetitionResolution> {
    const existing = await database
        .selectFrom('tournament_sources')
        .select('competition_id')
        .where('provider', '=', 'vetts')
        .where('source_type', '=', 'results')
        .where('source_key', '=', metadata.tournamentId)
        .executeTakeFirst();
    if (existing) return { competitionId: existing.competition_id, matchMethod: 'existing-source' };

    const candidates = await findCalendarCandidates(database, metadata);
    const venue = [metadata.venueName, metadata.venueTown, metadata.venuePostcode]
        .filter(Boolean)
        .join(' ') || null;
    const choice = chooseTournamentCandidate(
        {
            name: metadata.name,
            startDate: metadata.startDate,
            endDate: metadata.endDate,
            venue,
            category: VETTS_CATEGORY,
        },
        candidates,
    );

    if (choice.decision === 'automatic' && choice.candidate && choice.score) {
        await saveTournamentSource(
            database,
            choice.candidate.id,
            metadata,
            'automatic',
            choice.score.total,
        );
        return { competitionId: choice.candidate.id, matchMethod: 'automatic' };
    }

    const separateCompetitionId = await upsertSeparateCompetition(database, seasonId, metadata);
    if (choice.decision === 'review' && choice.candidate && choice.score) {
        await recordReviewCandidate(database, metadata, {
            id: choice.candidate.id,
            venue: choice.candidate.venue ?? null,
        }, choice.score);
        await saveTournamentSource(
            database,
            separateCompetitionId,
            metadata,
            'review-pending',
            choice.score.total,
        );
        return { competitionId: separateCompetitionId, matchMethod: 'review' };
    }

    await saveTournamentSource(database, separateCompetitionId, metadata, 'separate', null);
    return { competitionId: separateCompetitionId, matchMethod: 'separate' };
}

export async function upsertVettsSourceEvent(
    database: Kysely<any>,
    platformId: string,
    competitionId: string,
    metadata: VettsTournamentMetadata,
): Promise<string> {
    const now = new Date();
    return database
        .insertInto('staging.source_events')
        .values({
            platform_id: platformId,
            source: VETTS_SOURCE,
            external_id: metadata.tournamentId,
            name: metadata.name,
            event_date: metadata.startDate,
            category: VETTS_CATEGORY,
            public_url: metadata.sourceUrl,
            raw_payload: metadata,
            canonical_competition_id: competitionId,
            last_seen_at: now,
            updated_at: now,
        })
        .onConflict((conflict: any) =>
            conflict.columns(['source', 'external_id']).doUpdateSet({
                name: (eb: any) => eb.ref('excluded.name'),
                event_date: (eb: any) => eb.ref('excluded.event_date'),
                category: (eb: any) => eb.ref('excluded.category'),
                public_url: (eb: any) => eb.ref('excluded.public_url'),
                raw_payload: (eb: any) => eb.ref('excluded.raw_payload'),
                canonical_competition_id: competitionId,
                last_seen_at: now,
                updated_at: now,
            }),
        )
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row: { id: string }) => row.id);
}

export async function upsertVettsResultRows(
    database: Kysely<any>,
    sourceEventId: string,
    matches: VettsMatchResult[],
): Promise<void> {
    if (matches.length === 0) return;
    const now = new Date();

    await database
        .insertInto('staging.source_event_result_rows')
        .values(matches.map((match) => ({
            source_event_id: sourceEventId,
            source: VETTS_SOURCE,
            external_id: match.externalId,
            played_at: match.playedAt,
            round_name: match.roundName,
            round_order: match.roundOrder,
            round_raw: { eventExternalId: match.eventExternalId, eventName: match.eventName },
            home_raw: JSON.stringify({ players: match.homePlayers, scores: match.gameScores }),
            away_raw: JSON.stringify({ players: match.awayPlayers, scores: match.gameScores }),
            home_player_name: match.homePlayers.map((player) => player.name).join(' / '),
            home_player_external_id: match.homePlayers.map((player) => player.externalId).join('|'),
            away_player_name: match.awayPlayers.map((player) => player.name).join(' / '),
            away_player_external_id: match.awayPlayers.map((player) => player.externalId).join('|'),
            winner_side: match.winnerSide,
            raw_payload: match,
            last_seen_at: now,
            updated_at: now,
        })))
        .onConflict((conflict: any) =>
            conflict.columns(['source', 'external_id']).doUpdateSet({
                source_event_id: sourceEventId,
                played_at: (eb: any) => eb.ref('excluded.played_at'),
                round_name: (eb: any) => eb.ref('excluded.round_name'),
                round_order: (eb: any) => eb.ref('excluded.round_order'),
                round_raw: (eb: any) => eb.ref('excluded.round_raw'),
                home_raw: (eb: any) => eb.ref('excluded.home_raw'),
                away_raw: (eb: any) => eb.ref('excluded.away_raw'),
                home_player_name: (eb: any) => eb.ref('excluded.home_player_name'),
                home_player_external_id: (eb: any) => eb.ref('excluded.home_player_external_id'),
                away_player_name: (eb: any) => eb.ref('excluded.away_player_name'),
                away_player_external_id: (eb: any) => eb.ref('excluded.away_player_external_id'),
                winner_side: (eb: any) => eb.ref('excluded.winner_side'),
                raw_payload: (eb: any) => eb.ref('excluded.raw_payload'),
                last_seen_at: now,
                updated_at: now,
            }),
        )
        .execute();
}
