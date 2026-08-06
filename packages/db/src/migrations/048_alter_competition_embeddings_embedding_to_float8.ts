import { type Kysely, sql } from 'kysely';

/**
 * Store competition embeddings as a native `double precision[]` column instead
 * of `jsonb`.
 *
 * The worker writes embeddings as a JS `number[]`. node-postgres sends JS
 * arrays as PostgreSQL arrays (array OID, literal `{0.1,0.2,…}`), which cannot
 * be cast to `jsonb` — resulting in `invalid input syntax for type json` and
 * every embedding match falling back to deterministic string matching. A real
 * array column accepts that binding directly, so `embedding: vector` works
 * as-is and reads back as a JS `number[]` (which `storedEmbedding()` already
 * handles).
 *
 * `competition_embeddings` is a worker-only cache and has no production rows
 * at the time of this migration, but the `USING` clause safely converts any
 * existing jsonb array (including an empty `[]`) so this is safe to run on an
 * already-populated environment too. Postgres forbids subqueries in a
 * `USING` transform expression, so the jsonb array text `[0.1, 0.2]` is
 * rewritten into the PostgreSQL array literal `{0.1,0.2}` with `replace` +
 * `translate` and then cast to `double precision[]`.
 */
export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        ALTER TABLE staging.competition_embeddings
        ALTER COLUMN embedding TYPE double precision[]
        USING (translate(replace(embedding::text, ' ', ''), '[]', '{}'))::double precision[]
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        ALTER TABLE staging.competition_embeddings
        ALTER COLUMN embedding TYPE jsonb
        USING to_jsonb(embedding)
    `.execute(db);
}