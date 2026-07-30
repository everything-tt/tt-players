import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('user_sync_states')
        .addColumn('user_id', 'uuid', (col) => col.primaryKey())
        .addColumn('version', 'integer', (col) => col.notNull().defaultTo(1))
        .addColumn('data', 'jsonb', (col) => col.notNull().defaultTo(sql`'{"version":1,"entries":{}}'::jsonb`))
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addCheckConstraint('ck_user_sync_states_version', sql`version = 1`)
        .execute();

    await db.schema
        .createIndex('idx_user_sync_states_updated_at')
        .on('user_sync_states')
        .column('updated_at')
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('user_sync_states').ifExists().execute();
}
