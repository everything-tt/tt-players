import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('staging.feedback_attachments')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()` as any))
        .addColumn('feedback_id', 'uuid', (col) =>
            col.notNull().unique().references('staging.feedback.id').onDelete('cascade')
        )
        .addColumn('filename', 'varchar', (col) => col.notNull())
        .addColumn('mime_type', 'varchar', (col) => col.notNull())
        .addColumn('size_bytes', 'integer', (col) => col.notNull())
        .addColumn('content', 'bytea', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()` as any))
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('staging.feedback_attachments').execute();
}
