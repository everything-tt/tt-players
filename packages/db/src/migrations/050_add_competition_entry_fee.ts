import { type Kysely } from 'kysely';

/**
 * Store the entry fee extracted from entry forms (e.g. "£25", "£15 per event").
 * Kept as free text because PDF/Google Form sources express fees in many
 * formats and currencies.
 */
export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('competitions')
        .addColumn('entry_fee', 'varchar')
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('competitions')
        .dropColumn('entry_fee')
        .execute();
}
