import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { RETRYABLE_JOB_SPEC, stableJobKey } from '../job-policy.js';
import { fetchSport80EventsPage } from '../sport80-client.js';
import { upsertSport80Platform, upsertSport80SourceEvent } from '../sport80-loader.js';

export interface ScrapeSport80EventsPayload {
    page?: number;
    limit?: number;
    category?: number;
    /**
     * Optional diagnostic guard. Discovery no longer has a default page cap;
     * if callers set one and the API reports more rows, the task fails loudly
     * instead of silently treating a truncated discovery as complete.
     */
    maxPages?: number;
    force?: boolean;
}

export interface Sport80PaginationInput {
    page: number;
    limit: number;
    rowCount: number;
    total: number;
    maxPages?: number;
}

export function nextSport80EventsPage(input: Sport80PaginationInput): number | null {
    const { page, limit, rowCount, total, maxPages } = input;
    if (!Number.isInteger(page) || page < 0) throw new Error(`invalid Sport80 page ${page}`);
    if (!Number.isInteger(limit) || limit <= 0) throw new Error(`invalid Sport80 page limit ${limit}`);
    if (!Number.isInteger(rowCount) || rowCount < 0 || rowCount > limit) {
        throw new Error(`invalid Sport80 row count ${rowCount} for limit ${limit}`);
    }
    if (!Number.isInteger(total) || total < 0) throw new Error(`invalid Sport80 total ${total}`);
    if (maxPages !== undefined && (!Number.isInteger(maxPages) || maxPages <= 0)) {
        throw new Error(`invalid Sport80 maxPages ${maxPages}`);
    }

    const alreadyBeforePage = page * limit;
    const fetched = alreadyBeforePage + rowCount;
    if (fetched >= total) return null;

    if (rowCount === 0) {
        throw new Error(
            `Sport80 pagination incomplete: page ${page} returned no rows after ${alreadyBeforePage}/${total}`,
        );
    }
    if (rowCount < limit) {
        throw new Error(
            `Sport80 pagination incomplete: page ${page} returned ${rowCount}/${limit} rows but API reports ${total} total`,
        );
    }

    const nextPage = page + 1;
    if (maxPages !== undefined && nextPage >= maxPages) {
        throw new Error(
            `Sport80 pagination incomplete: explicit maxPages=${maxPages} would stop after ${fetched}/${total} rows`,
        );
    }
    return nextPage;
}

export const scrapeSport80EventsTask: Task = async (payload, helpers) => {
    const {
        page = 0,
        limit = 100,
        category,
        maxPages,
        force = false,
    } = payload as ScrapeSport80EventsPayload;

    const result = await fetchSport80EventsPage({ page, limit, category });
    helpers.logger.info(
        `scrapeSport80EventsTask: page ${page}, ${result.data.length} events, total ${result.total}`,
    );

    const platformId = await upsertSport80Platform(db);
    const eventIds = result.data.map((event) => String(event.id));
    const existingRows = eventIds.length > 0
        ? await db
            .selectFrom('staging.sport80_event_scrape_state')
            .select(['event_id', 'status'])
            .where('event_id', 'in', eventIds)
            .execute()
        : [];
    const existingById = new Map(existingRows.map((row) => [row.event_id, row.status]));

    for (const event of result.data) {
        const eventId = String(event.id);
        const existingStatus = existingById.get(eventId);

        await upsertSport80SourceEvent(db, platformId, {
            id: eventId,
            name: event.name,
            date: event.date,
            category: event.category,
            raw: event,
        });

        await db
            .insertInto('staging.sport80_event_scrape_state')
            .values({
                event_id: eventId,
                event_name: event.name,
                event_date: event.date,
                category: event.category,
                status: 'pending',
                updated_at: new Date(),
            })
            .onConflict((conflict) =>
                conflict.column('event_id').doUpdateSet({
                    event_name: (eb) => eb.ref('excluded.event_name'),
                    event_date: (eb) => eb.ref('excluded.event_date'),
                    category: (eb) => eb.ref('excluded.category'),
                    updated_at: new Date(),
                }),
            )
            .execute();

        if (!force && existingStatus === 'processed') {
            helpers.logger.info(`scrapeSport80EventsTask: skipping processed event ${eventId}`);
            continue;
        }

        await helpers.addJob('scrapeSport80EventResultsTask', {
            eventId,
            eventName: event.name,
            eventDate: event.date,
            category: event.category,
            force,
        }, {
            ...RETRYABLE_JOB_SPEC,
            jobKey: stableJobKey('sport80-event-results', eventId),
        });
    }

    const nextPage = nextSport80EventsPage({
        page,
        limit,
        rowCount: result.data.length,
        total: result.total,
        maxPages,
    });
    if (nextPage !== null) {
        await helpers.addJob('scrapeSport80EventsTask', {
            page: nextPage,
            limit,
            category,
            ...(maxPages === undefined ? {} : { maxPages }),
            force,
        }, {
            ...RETRYABLE_JOB_SPEC,
            jobKey: stableJobKey('sport80-events-page', nextPage, limit, category),
        });
    }
};
