import type { Task } from 'graphile-worker';
import { sql, type Kysely } from 'kysely';
import { db, type Database } from '@tt-players/db';
import {
    chooseTournamentCandidateWithEmbeddings,
    type TournamentEmbeddingMatchScore,
} from '../event-embeddings.js';
import { storeScrapePayload } from '../extractor.js';
import { fetchSport80EventResults, sport80Urls } from '../sport80-client.js';
import { loadTTLeaguesData } from '../loader.js';
import { parseSport80EventName, parseSport80EventResults } from '../sport80-parser.js';
import {
    upsertSport80League,
    upsertSport80Platform,
    upsertSport80SourceEvent,
    upsertSport80SourceEventResultRows,
} from '../sport80-loader.js';

export interface ScrapeSport80EventResultsPayload {
    eventId: string;
    eventName?: string;
    eventDate?: string | null;
    category?: string;
    force?: boolean;
}

interface CompetitionResolution {
    competitionId: string;
    calendarCompetitionId: string | null;
    matchMethod:
        | 'existing-source'
        | 'embedding-automatic'
        | 'automatic'
        | 'review'
        | 'separate';
}

interface TournamentMatchEvidence {
    decision: string;
    reason: string;
    embeddingUsed: boolean;
    embeddingProvider: 'cloudflare-workers-ai' | null;
    embeddingModel: string | null;
    embeddingDimensions: number | null;
    embeddingError?: string;
    scores?: TournamentEmbeddingMatchScore;
}

async function upsertSeason(
    db: Kysely<Database>,
    leagueId: string,
    eventDate: string | null,
): Promise<string> {
    const year = eventDate?.match(/^(\d{4})/)?.[1] ?? 'unknown';
    const externalId = `sport80-${year}`;
    const name = year === 'unknown' ? 'Sport:80 Unknown Season' : `Sport:80 ${year}`;

    const existing = await db
        .selectFrom('seasons')
        .select('id')
        .where('league_id', '=', leagueId)
        .where('external_id', '=', externalId)
        .executeTakeFirst();
    if (existing) return existing.id;

    const row = await db
        .insertInto('seasons')
        .values({
            league_id: leagueId,
            external_id: externalId,
            name,
            is_active: year !== 'unknown',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

async function saveSport80SourceMapping(
    database: Kysely<any>,
    competitionId: string,
    eventId: string,
    eventName: string,
    eventDate: string | null,
    category: string | null,
    matchMethod: string,
    matchConfidence: number | null,
    matchEvidence?: TournamentMatchEvidence,
): Promise<void> {
    const sourceUrl = sport80Urls.eventResultsTable(eventId);
    const rawPayload = {
        id: eventId,
        name: eventName,
        date: eventDate,
        category,
        ...(matchEvidence ? { match: matchEvidence } : {}),
    };
    const now = new Date();
    await database
        .insertInto('tournament_sources')
        .values({
            competition_id: competitionId,
            provider: 'sport80',
            source_type: 'results',
            external_id: eventId,
            source_url: sourceUrl,
            source_key: eventId,
            raw_payload: rawPayload,
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
                external_id: eventId,
                source_url: sourceUrl,
                raw_payload: rawPayload,
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
    eventId: string,
    eventName: string,
    eventDate: string | null,
    candidateId: string,
    candidateVenue: string | null,
    score: TournamentEmbeddingMatchScore,
    evidence: TournamentMatchEvidence,
): Promise<void> {
    const existing = await database
        .selectFrom('tournament_match_candidates')
        .select('id')
        .where('incoming_provider', '=', 'sport80')
        .where('incoming_external_id', '=', eventId)
        .where('candidate_competition_id', '=', candidateId)
        .where('status', '=', 'pending')
        .executeTakeFirst();
    if (existing) return;

    await database
        .insertInto('tournament_match_candidates')
        .values({
            incoming_provider: 'sport80',
            incoming_external_id: eventId,
            incoming_name: eventName,
            incoming_date: eventDate,
            incoming_venue: candidateVenue,
            candidate_competition_id: candidateId,
            name_score: score.name,
            embedding_score: score.semantic,
            date_score: score.date,
            venue_score: score.venue,
            category_score: score.category,
            total_score: score.total,
            score_evidence: evidence,
            status: 'pending',
        })
        .execute();
}

async function findCalendarCandidates(
    database: Kysely<any>,
    eventDate: string | null,
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
            'category',
        ])
        .where('type', '=', 'individual')
        .where('record_kind', '=', 'calendar')
        .where('deleted_at', 'is', null);

    if (eventDate) {
        query = query
            .where('start_date', '>=', sql<Date>`${eventDate}::date - interval '7 days'`)
            .where('start_date', '<=', sql<Date>`${eventDate}::date + interval '7 days'`);
    }

    return query.limit(50).execute();
}

async function upsertResultCompetition(
    database: Kysely<any>,
    seasonId: string,
    eventId: string,
    eventName: string,
    eventDate: string | null,
    category: string | null,
    matchedCalendarCompetitionId: string | null,
): Promise<string> {
    const externalId = `sport80:event:${eventId}`;
    const parsedName = parseSport80EventName(eventName);
    const displayName = parsedName.displayName;
    const normalizedEventDate = eventDate ?? parsedName.dateFromName;
    const normalizedCategory = category ?? parsedName.category;
    const sourceUrl = sport80Urls.eventResultsTable(eventId);
    const existing = await database
        .selectFrom('competitions')
        .select('id')
        .where('external_id', '=', externalId)
        .executeTakeFirst();
    if (existing) {
        await database
            .updateTable('competitions')
            .set({
                name: eventName,
                display_name: displayName,
                event_date: normalizedEventDate,
                start_date: normalizedEventDate,
                category: normalizedCategory,
                source: 'sport80',
                source_url: sourceUrl,
                record_kind: 'result',
                event_status: 'completed',
                matched_calendar_competition_id: matchedCalendarCompetitionId,
            })
            .where('id', '=', existing.id)
            .execute();
        return existing.id;
    }

    const row = await database
        .insertInto('competitions')
        .values({
            season_id: seasonId,
            external_id: externalId,
            name: eventName,
            display_name: displayName,
            event_date: normalizedEventDate,
            start_date: normalizedEventDate,
            category: normalizedCategory,
            type: 'individual',
            source: 'sport80',
            source_url: sourceUrl,
            record_kind: 'result',
            event_status: 'completed',
            matched_calendar_competition_id: matchedCalendarCompetitionId,
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

async function resolveCompetition(
    database: Kysely<any>,
    seasonId: string,
    eventId: string,
    eventName: string,
    eventDate: string | null,
    category: string | null,
): Promise<CompetitionResolution> {
    const existingSource = await database
        .selectFrom('tournament_sources as ts')
        .innerJoin('competitions as c', 'c.id', 'ts.competition_id')
        .select([
            'ts.competition_id',
            'ts.match_method',
            'c.record_kind',
            'c.matched_calendar_competition_id',
        ])
        .where('ts.provider', '=', 'sport80')
        .where('ts.source_type', '=', 'results')
        .where('ts.source_key', '=', eventId)
        .executeTakeFirst();
    if (existingSource?.record_kind === 'result') {
        return {
            competitionId: existingSource.competition_id,
            calendarCompetitionId: existingSource.matched_calendar_competition_id ?? null,
            matchMethod: 'existing-source',
        };
    }

    const parsedName = parseSport80EventName(eventName);
    const normalizedDate = eventDate ?? parsedName.dateFromName;
    const normalizedCategory = category ?? parsedName.category;
    const candidates = await findCalendarCandidates(database, normalizedDate);
    const choice = await chooseTournamentCandidateWithEmbeddings(
        database,
        {
            name: parsedName.displayName,
            startDate: normalizedDate,
            endDate: normalizedDate,
            category: normalizedCategory,
            venue: null,
        },
        candidates,
    );
    if (choice.embeddingError) {
        console.warn(
            `Sport:80 event ${eventId} embedding reconciliation fallback: ${choice.embeddingError}`,
        );
    }

    const evidence: TournamentMatchEvidence = {
        decision: choice.decision,
        reason: choice.reason,
        embeddingUsed: choice.embeddingUsed,
        embeddingProvider: choice.embeddingUsed ? 'cloudflare-workers-ai' : null,
        embeddingModel: choice.embeddingModel,
        embeddingDimensions: choice.embeddingDimensions,
        ...(choice.embeddingError ? { embeddingError: choice.embeddingError } : {}),
        ...(choice.score ? { scores: choice.score } : {}),
    };

    let calendarCompetitionId: string | null = null;
    let matchMethod: CompetitionResolution['matchMethod'] = 'separate';
    let matchConfidence: number | null = null;

    if (choice.decision === 'automatic' && choice.candidate && choice.score) {
        calendarCompetitionId = choice.candidate.id;
        matchMethod = choice.embeddingUsed ? 'embedding-automatic' : 'automatic';
        matchConfidence = choice.score.total;
    } else if (choice.decision === 'review' && choice.candidate && choice.score) {
        matchMethod = 'review';
        matchConfidence = choice.score.total;
        await recordReviewCandidate(
            database,
            eventId,
            eventName,
            normalizedDate,
            choice.candidate.id,
            choice.candidate.venue ?? null,
            choice.score,
            evidence,
        );
    }

    const resultCompetitionId = await upsertResultCompetition(
        database,
        seasonId,
        eventId,
        eventName,
        normalizedDate,
        normalizedCategory,
        calendarCompetitionId,
    );

    if (calendarCompetitionId) {
        await database
            .updateTable('competitions')
            .set({
                processed_at: new Date(),
                event_status: 'processed',
                record_kind: 'calendar',
            })
            .where('id', '=', calendarCompetitionId)
            .execute();
    }

    await saveSport80SourceMapping(
        database,
        resultCompetitionId,
        eventId,
        eventName,
        normalizedDate,
        normalizedCategory,
        matchMethod === 'review'
            ? choice.embeddingUsed ? 'embedding-review-pending' : 'review-pending'
            : matchMethod,
        matchConfidence,
        evidence,
    );

    return {
        competitionId: resultCompetitionId,
        calendarCompetitionId,
        matchMethod,
    };
}

export const scrapeSport80EventResultsTask: Task = async (payload, helpers) => {
    const { eventId, eventName, eventDate, category, force = false } = payload as ScrapeSport80EventResultsPayload;

    const existing = await db
        .selectFrom('staging.sport80_event_scrape_state')
        .select('status')
        .where('event_id', '=', eventId)
        .executeTakeFirst();
    if (!force && existing?.status === 'processed') {
        helpers.logger.info(`scrapeSport80EventResultsTask: event ${eventId} already processed, skipping`);
        return;
    }

    await db
        .insertInto('staging.sport80_event_scrape_state')
        .values({
            event_id: eventId,
            event_name: eventName ?? null,
            event_date: eventDate ?? null,
            category: category ?? null,
            status: 'pending',
            last_attempted_at: new Date(),
            updated_at: new Date(),
        })
        .onConflict((oc) =>
            oc.column('event_id').doUpdateSet({
                event_name: (eb) => eb.ref('excluded.event_name'),
                event_date: (eb) => eb.ref('excluded.event_date'),
                category: (eb) => eb.ref('excluded.category'),
                status: 'pending',
                last_attempted_at: new Date(),
                last_error: null,
                updated_at: new Date(),
            }),
        )
        .execute();

    try {
        const result = await fetchSport80EventResults(eventId);
        helpers.logger.info(
            `scrapeSport80EventResultsTask: event ${eventId}, ${result.data.length} result rows`,
        );

        const resolvedName = eventName ?? `Sport:80 Event ${eventId}`;
        const platformId = await upsertSport80Platform(db);
        const leagueId = await upsertSport80League(db, platformId);
        const seasonId = await upsertSeason(db, leagueId, eventDate ?? null);
        const resolution = await resolveCompetition(
            db as Kysely<any>,
            seasonId,
            eventId,
            resolvedName,
            eventDate ?? null,
            category ?? null,
        );
        const competitionId = resolution.competitionId;
        helpers.logger.info(
            `scrapeSport80EventResultsTask: event ${eventId} resolved via ${resolution.matchMethod} to ${competitionId}`,
        );

        const sourceEventId = await upsertSport80SourceEvent(db, platformId, {
            id: eventId,
            name: resolvedName,
            date: eventDate ?? null,
            category: category ?? null,
            raw: {
                id: Number.isNaN(Number(eventId)) ? eventId : Number(eventId),
                date: eventDate ?? null,
                name: resolvedName,
                category: category ?? null,
            },
            canonicalCompetitionId: competitionId,
        });

        const logId = await storeScrapePayload(
            sport80Urls.eventResultsTable(eventId),
            platformId,
            JSON.stringify(result),
            db,
        );
        await upsertSport80SourceEventResultRows(db, sourceEventId, result.data);

        const parsedData = parseSport80EventResults({
            eventId,
            eventName: resolvedName,
            eventDate: eventDate ?? null,
            rows: result.data,
        });

        await loadTTLeaguesData(db, {
            competitionId,
            platformId,
            parsedData,
            scrapeLogIds: [logId],
        });

        const now = new Date();
        await (db as Kysely<any>)
            .updateTable('competitions')
            .set({
                last_scraped_at: now,
                record_kind: 'result',
                event_status: 'completed',
            })
            .where('id', '=', competitionId)
            .execute();

        await db
            .updateTable('staging.sport80_event_scrape_state')
            .set({
                status: 'processed',
                result_rows: result.data.length,
                last_error: null,
                processed_at: now,
                updated_at: now,
            })
            .where('event_id', '=', eventId)
            .execute();
    } catch (error) {
        await db
            .updateTable('staging.sport80_event_scrape_state')
            .set({
                status: 'failed',
                last_error: error instanceof Error ? error.message : String(error),
                updated_at: new Date(),
            })
            .where('event_id', '=', eventId)
            .execute();
        throw error;
    }
};
