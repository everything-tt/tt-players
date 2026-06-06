import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`CREATE TYPE score_source AS ENUM ('games', 'win_loss_only')`.execute(db);

    await db.schema
        .alterTable('rubbers')
        .addColumn('score_source', sql`score_source`, (col) =>
            col.notNull().defaultTo('games'),
        )
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('rubbers')
        .dropColumn('score_source')
        .execute();

    await sql`DROP TYPE IF EXISTS score_source`.execute(db);
}
