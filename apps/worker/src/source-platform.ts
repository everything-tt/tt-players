import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

async function ensureSourcePlatformLocked(
    database: Kysely<Database>,
    name: string,
    baseUrl: string,
): Promise<string> {
    await sql`
        SELECT pg_advisory_xact_lock(hashtext(${`source-platform:${baseUrl}`}))
    `.execute(database);

    const existing = await database
        .selectFrom('platforms')
        .select('id')
        .where('base_url', '=', baseUrl)
        .executeTakeFirst();
    if (existing) return existing.id;

    return database
        .insertInto('platforms')
        .values({ name, base_url: baseUrl })
        .returning('id')
        .executeTakeFirstOrThrow()
        .then((row) => row.id);
}

/**
 * `platforms` predates the source registry and has no natural-key uniqueness
 * constraint. Serialize creation by base URL with a database advisory xact lock
 * so multiple worker replicas cannot create duplicate provider rows.
 *
 * Kysely transactions inherit `Kysely` and expose `isTransaction`. Reuse an
 * existing transaction when this helper is called from a larger atomic source
 * operation; otherwise open the transaction that owns the advisory lock.
 */
export async function ensureSourcePlatform(
    database: Kysely<Database>,
    name: string,
    baseUrl: string,
): Promise<string> {
    if (database.isTransaction) {
        return ensureSourcePlatformLocked(database, name, baseUrl);
    }

    return database.transaction().execute((trx) =>
        ensureSourcePlatformLocked(trx, name, baseUrl),
    );
}
