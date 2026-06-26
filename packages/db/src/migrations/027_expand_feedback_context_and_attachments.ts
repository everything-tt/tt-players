import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('staging.feedback')
        .addColumn('page_path', 'varchar')
        .addColumn('page_title', 'varchar')
        .execute();

    await sql`ALTER TABLE staging.feedback_attachments DROP CONSTRAINT IF EXISTS feedback_attachments_feedback_id_key`.execute(db);
    await sql`ALTER TABLE staging.feedback_attachments DROP CONSTRAINT IF EXISTS feedback_attachments_feedback_id_unique`.execute(db);
    await db.schema
        .createIndex('feedback_attachments_feedback_id_idx')
        .on('staging.feedback_attachments')
        .column('feedback_id')
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropIndex('feedback_attachments_feedback_id_idx').ifExists().execute();
    await sql`
        DELETE FROM staging.feedback_attachments
        WHERE id IN (
            SELECT id
            FROM (
                SELECT id, row_number() OVER (
                    PARTITION BY feedback_id
                    ORDER BY created_at ASC, id ASC
                ) AS rn
                FROM staging.feedback_attachments
            ) ranked
            WHERE ranked.rn > 1
        )
    `.execute(db);
    await sql`ALTER TABLE staging.feedback_attachments ADD CONSTRAINT feedback_attachments_feedback_id_key UNIQUE (feedback_id)`.execute(db);

    await db.schema
        .alterTable('staging.feedback')
        .dropColumn('page_title')
        .dropColumn('page_path')
        .execute();
}
