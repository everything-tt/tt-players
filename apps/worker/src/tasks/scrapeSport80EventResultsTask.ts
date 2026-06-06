import type { Task } from 'graphile-worker';
import { type Kysely } from 'kysely';
import { db, type Database } from '@tt-players/db';
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

async function upsertCompetition(
    db: Kysely<Database>,
    seasonId: string,
    eventId: string,
    eventName: string,
    eventDate: string | null,
    category: string | null,
): Promise<string> {
    const externalId = `sport80:event:${eventId}`;
    const parsedName = parseSport80EventName(eventName);
    const displayName = parsedName.displayName;
    const normalizedEventDate = eventDate ?? parsedName.dateFromName;
    const normalizedCategory = category ?? parsedName.category;
    const existing = await db
        .selectFrom('competitions')
        .select('id')
        .where('season_id', '=', seasonId)
        .where('external_id', '=', externalId)
        .executeTakeFirst();
    if (existing) {
        await db
            .updateTable('competitions')
            .set({
                name: eventName,
                display_name: displayName,
                event_date: normalizedEventDate,
                category: normalizedCategory,
            })
            .where('id', '=', existing.id)
            .execute();
        return existing.id;
    }

    const row = await db
        .insertInto('competitions')
        .values({
            season_id: seasonId,
            external_id: externalId,
            name: eventName,
            display_name: displayName,
            event_date: normalizedEventDate,
            category: normalizedCategory,
            type: 'individual',
        })
        .returning('id')
        .executeTakeFirstOrThrow();
    return row.id;
}

export const scrapeSport80EventResultsTask: Task = async (payload, helpers) => {
    const { eventId, eventName, eventDate, category, force = false } = payload as ScrapeSport80EventResultsPayload;

    const existing = await db
        .selectFrom('sport80_event_scrape_state')
        .select('status')
        .where('event_id', '=', eventId)
        .executeTakeFirst();
    if (!force && existing?.status === 'processed') {
        helpers.logger.info(`scrapeSport80EventResultsTask: event ${eventId} already processed, skipping`);
        return;
    }

    await db
        .insertInto('sport80_event_scrape_state')
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

        const platformId = await upsertSport80Platform(db);
        const leagueId = await upsertSport80League(db, platformId);
        const seasonId = await upsertSeason(db, leagueId, eventDate ?? null);
        const competitionId = await upsertCompetition(
            db,
            seasonId,
            eventId,
            eventName ?? `Sport:80 Event ${eventId}`,
            eventDate ?? null,
            category ?? null,
        );
        const sourceEventId = await upsertSport80SourceEvent(db, platformId, {
            id: eventId,
            name: eventName ?? `Sport:80 Event ${eventId}`,
            date: eventDate ?? null,
            category: category ?? null,
            raw: {
                id: Number.isNaN(Number(eventId)) ? eventId : Number(eventId),
                date: eventDate ?? null,
                name: eventName ?? `Sport:80 Event ${eventId}`,
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
            eventName: eventName ?? `Sport:80 Event ${eventId}`,
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
        await db
            .updateTable('competitions')
            .set({ last_scraped_at: now })
            .where('id', '=', competitionId)
            .execute();

        await db
            .updateTable('sport80_event_scrape_state')
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
            .updateTable('sport80_event_scrape_state')
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
