import { type Kysely } from 'kysely';

/**
 * Structured list of competition categories extracted from entry forms,
 * each with an optional per-category entry fee:
 * `[{"name": "U13 Mixed", "entry_fee": "£10"}, ...]`.
 */
export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('competitions')
        .addColumn('categories', 'jsonb')
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('competitions')
        .dropColumn('categories')
        .execute();
}
