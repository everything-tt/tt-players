import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { parseSport80EventName } from './sport80-parser.js';

dotenv.config();

async function main(): Promise<void> {
    const rows = await db
        .selectFrom('staging.source_events')
        .select(['canonical_competition_id', 'name', 'event_date', 'category'])
        .where('source', '=', 'sport80')
        .where('canonical_competition_id', 'is not', null)
        .execute();

    let updated = 0;
    for (const row of rows) {
        if (!row.canonical_competition_id) continue;
        const parsed = parseSport80EventName(row.name);
        await db
            .updateTable('competitions')
            .set({
                display_name: parsed.displayName,
                event_date: row.event_date ?? parsed.dateFromName,
                category: row.category ?? parsed.category,
            })
            .where('id', '=', row.canonical_competition_id)
            .execute();
        updated++;
    }

    console.log(`backfill-sport80-competition-display-fields: updated ${updated} competitions`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.destroy();
    });
