import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

/**
 * `platforms` predates the source registry and has no natural-key uniqueness
 * constraint. Serialize creation by base URL with a database advisory xact lock
 * so multiple worker replicas cannot create duplicate provider rows.
 */
export async function ensureSourcePlatform(
    database: Kysely<Database>,
    name: string,
    baseUrl: string,
): Promise<string> {
    return database.transaction().execute(async (trx) => {
        await sql`
            SELECT pg_advisory_xact_lock(hashtext(${`source-platform:${baseUrl}`}))
        `.execute(trx);

        const existing = await trx
            .selectFrom('platforms')
            .select('id')
            .where('base_url', '=', baseUrl)
            .executeTakeFirst();
        if (existing) return existing.id;

        return trx
            .insertInto('platforms')
            .values({ name, base_url: baseUrl })
            .returning('id')
            .executeTakeFirstOrThrow()
            .then((row) => row.id);
    });
}
