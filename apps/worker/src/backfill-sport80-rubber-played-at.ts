import dotenv from 'dotenv';
import { sql } from 'kysely';
import { db } from '@tt-players/db';
import { sport80Timestamp } from './sport80-parser.js';

dotenv.config();

type Sport80EventResultsPayload = {
    data?: Array<{
        id?: number | string;
        date_and_time?: string | null;
    }>;
};

const logs = await db
    .selectFrom('raw_scrape_logs')
    .select(['endpoint_url', 'raw_payload'])
    .where('endpoint_url', 'like', '%admin-tte-rankings.sport80.com/api/events/%/table?data=1%')
    .execute();

let updated = 0;
let seenRows = 0;
const mappings = new Map<string, string>();

for (const log of logs) {
    let payload: Sport80EventResultsPayload;
    try {
        payload = JSON.parse(log.raw_payload) as Sport80EventResultsPayload;
    } catch {
        continue;
    }

    for (const row of payload.data ?? []) {
        const playedAt = sport80Timestamp(row.date_and_time ?? null);
        if (!row.id || !playedAt) continue;
        seenRows += 1;
        mappings.set(`sport80:result:${row.id}`, playedAt);
    }
}

if (mappings.size > 0) {
    await db.transaction().execute(async (trx) => {
        await sql`
            CREATE TEMP TABLE sport80_played_at_backfill (
                external_id varchar PRIMARY KEY,
                played_at timestamp NOT NULL
            ) ON COMMIT DROP
        `.execute(trx);

        await trx
            .insertInto('sport80_played_at_backfill' as any)
            .values(
                Array.from(mappings.entries()).map(([external_id, played_at]) => ({
                    external_id,
                    played_at,
                })),
            )
            .execute();

        const result = await sql`
            UPDATE rubbers r
            SET played_at = b.played_at
            FROM sport80_played_at_backfill b
            WHERE r.external_id = b.external_id
              AND r.played_at IS NULL
        `.execute(trx);
        updated = Number(result.numUpdatedRows ?? 0);
    });
}

console.log(`Sport80 played_at backfill: saw ${seenRows} result rows, updated ${updated} rubbers`);

await db.destroy();
