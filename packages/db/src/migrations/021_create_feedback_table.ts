import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('staging.feedback')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()` as any))
        .addColumn('name', 'varchar')
        .addColumn('email', 'varchar')
        .addColumn('message_type', 'varchar', (col) => col.notNull())
        .addColumn('message', 'text', (col) => col.notNull())
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()` as any))
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('staging.feedback').execute();
}
