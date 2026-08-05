import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('rating_audit_snapshots')
        .addColumn('model_id', 'uuid', (col) =>
            col.primaryKey().references('rating_models.id').onDelete('cascade'))
        .addColumn('content', 'jsonb', (col) => col.notNull())
        .addColumn('generated_at', 'timestamp', (col) => col.notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();

    await db
        .insertInto('data_versions')
        .values({ key: 'rating-audit', version: 1 })
        .onConflict((conflict) => conflict.column('key').doNothing())
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('rating_audit_snapshots').ifExists().execute();
    await db.deleteFrom('data_versions').where('key', '=', 'rating-audit').execute();
}
