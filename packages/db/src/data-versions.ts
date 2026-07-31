import { sql, type Kysely } from 'kysely';
import type { Database } from './identity-resolution-types.js';

export type DataVersionKey = 'player-results' | 'ratings' | 'source-quality';

export async function readDataVersion(
    db: Kysely<Database>,
    key: DataVersionKey,
): Promise<string> {
    const row = await db
        .selectFrom('data_versions')
        .select('version')
        .where('key', '=', key)
        .executeTakeFirst();

    return String(row?.version ?? 0);
}

export async function bumpDataVersion(
    db: Kysely<Database>,
    key: DataVersionKey,
): Promise<string> {
    const row = await db
        .insertInto('data_versions')
        .values({ key, version: 1, updated_at: new Date() })
        .onConflict((conflict) => conflict.column('key').doUpdateSet({
            version: sql`data_versions.version + 1`,
            updated_at: new Date(),
        }))
        .returning('version')
        .executeTakeFirstOrThrow();

    return String(row.version);
}
