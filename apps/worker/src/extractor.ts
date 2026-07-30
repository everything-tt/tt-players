import { createHash } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { fetchWithTT365Policy } from './tt365-http.js';

export async function storeScrapePayload(
    url: string,
    platformId: string,
    body: string,
    db: Kysely<Database>,
): Promise<string> {
    const hash = createHash('sha256').update(body).digest('hex');

    const result = await db
        .insertInto('staging.raw_scrape_logs')
        .values({
            platform_id: platformId,
            endpoint_url: url,
            raw_payload: body,
            payload_hash: hash,
            status: 'pending',
        })
        .onConflict((oc) =>
            oc.columns(['endpoint_url', 'payload_hash']).doUpdateSet({
                scraped_at: sql`now()`,
            }),
        )
        .returning('id')
        .executeTakeFirstOrThrow();

    return result.id;
}

/**
 * Fetches data from the given URL, hashes the response body (SHA256),
 * and upserts it into the `raw_scrape_logs` table.
 *
 * - On a new (endpoint_url, payload_hash) pair → INSERTs a new row.
 * - On a duplicate (endpoint_url, payload_hash) → UPDATEs `scraped_at` only.
 * - On HTTP errors or network failures → throws so Graphile Worker can retry.
 */
export async function extractAndStore(
    url: string,
    platformId: string,
    db: Kysely<Database>,
    requestInit: RequestInit = {},
): Promise<string> {
    const response = await fetchWithTT365Policy(url, requestInit);

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} ${response.statusText} when fetching ${url}`,
        );
    }

    const body = await response.text();
    return storeScrapePayload(url, platformId, body, db);
}
