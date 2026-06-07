import dotenv from 'dotenv';
import { sql } from 'kysely';
import { db } from '@tt-players/db';
import { sport80Urls } from './sport80-client.js';
import {
    upsertSport80Platform,
    upsertSport80SourceEvent,
    upsertSport80SourceEventResultRows,
} from './sport80-loader.js';

dotenv.config();

type Sport80RawResultLog = {
    event_id: string;
    event_name: string;
    event_date: string | null;
    category: string | null;
    competition_id: string | null;
    raw_payload: string;
};

function parseJsonPayload(raw: string): { data?: unknown[] } {
    const parsed = JSON.parse(raw) as { data?: unknown[] };
    if (!Array.isArray(parsed.data)) {
        throw new Error('Sport:80 raw payload does not contain a data array');
    }
    return parsed;
}

async function main(): Promise<void> {
    const platformId = await upsertSport80Platform(db);
    const result = await sql<Sport80RawResultLog>`
        WITH logs AS (
            SELECT
                substring(endpoint_url from '/events/([0-9]+)/table') AS event_id,
                raw_payload
            FROM staging.raw_scrape_logs
            WHERE endpoint_url LIKE '%/api/events/%/table?data=1%'
        )
        SELECT
            logs.event_id,
            state.event_name,
            state.event_date::text AS event_date,
            state.category,
            c.id AS competition_id,
            logs.raw_payload
        FROM logs
        LEFT JOIN staging.sport80_event_scrape_state state
            ON state.event_id = logs.event_id
        LEFT JOIN competitions c
            ON c.external_id = 'sport80:event:' || logs.event_id
        WHERE logs.event_id IS NOT NULL
        ORDER BY logs.event_id::int DESC
    `.execute(db);
    const rows = result.rows;

    let events = 0;
    let resultRows = 0;

    for (const row of rows) {
        if (!row.event_id) continue;

        const payload = parseJsonPayload(row.raw_payload);
        const sourceEventId = await upsertSport80SourceEvent(db, platformId, {
            id: row.event_id,
            name: row.event_name ?? `Sport:80 Event ${row.event_id}`,
            date: row.event_date,
            category: row.category,
            raw: {
                id: Number(row.event_id),
                date: row.event_date,
                name: row.event_name ?? `Sport:80 Event ${row.event_id}`,
                category: row.category,
                result_url: sport80Urls.eventResultsTable(row.event_id),
            },
            canonicalCompetitionId: row.competition_id,
        });

        await upsertSport80SourceEventResultRows(db, sourceEventId, payload.data as any[]);
        events++;
        resultRows += payload.data?.length ?? 0;

        if (events % 500 === 0) {
            console.log(`backfill-sport80-source-events: staged ${events} events, ${resultRows} rows`);
        }
    }

    console.log(`backfill-sport80-source-events: staged ${events} events, ${resultRows} rows`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.destroy();
    });
