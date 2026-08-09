import { type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('tournament_sources')
        .addColumn('submitted_by_user_id', 'uuid')
        .execute();

    await db.schema
        .createIndex('idx_tournament_sources_submitted_by_user')
        .on('tournament_sources')
        .column('submitted_by_user_id')
        .where('submitted_by_user_id', 'is not', null)
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .dropIndex('idx_tournament_sources_submitted_by_user')
        .ifExists()
        .execute();

    await db.schema
        .alterTable('tournament_sources')
        .dropColumn('submitted_by_user_id')
        .execute();
}
