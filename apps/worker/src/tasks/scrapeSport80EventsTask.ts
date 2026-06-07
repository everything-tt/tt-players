import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { fetchSport80EventsPage } from '../sport80-client.js';
import { upsertSport80Platform, upsertSport80SourceEvent } from '../sport80-loader.js';

export interface ScrapeSport80EventsPayload {
    page?: number;
    limit?: number;
    category?: number;
    maxPages?: number;
    force?: boolean;
}

const SCRAPE_JOB_SPEC = { maxAttempts: 1 };

/**
 * Queues Sport:80 event-result scrape jobs from the public rankings results API.
 *
 * This is intentionally page-based so daily jobs can scrape the latest page(s),
 * while historical backfills can raise maxPages without a separate code path.
 */
export const scrapeSport80EventsTask: Task = async (payload, helpers) => {
    const {
        page = 0,
        limit = 100,
        category,
        maxPages = 3,
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
            .onConflict((oc) =>
                oc.column('event_id').doUpdateSet({
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
        }, SCRAPE_JOB_SPEC);
    }

    const nextPage = page + 1;
    const fetched = nextPage * limit;
    if (nextPage < maxPages && fetched < result.total) {
        await helpers.addJob('scrapeSport80EventsTask', {
            page: nextPage,
            limit,
            category,
            maxPages,
            force,
        }, SCRAPE_JOB_SPEC);
    }

};
