import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('competitions')
        .addColumn('source', 'varchar')
        .addColumn('source_url', 'varchar')
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('competitions')
        .dropColumn('source_url')
        .dropColumn('source')
        .execute();
}
