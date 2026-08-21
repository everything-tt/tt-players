import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('source_instances')
        .addColumn('discovery_status', 'varchar', (col) =>
            col.notNull().defaultTo('healthy')
        )
        .addColumn('last_discovery_at', 'timestamp')
        .addColumn('last_discovery_error', 'text')
        .addColumn('discovery_metadata', 'jsonb', (col) =>
            col.notNull().defaultTo(sql`'{}'::jsonb`)
        )
        .execute();

    await sql`
        ALTER TABLE source_instances
        ADD CONSTRAINT ck_source_instances_discovery_status
        CHECK (discovery_status IN ('healthy', 'no_active_competition', 'ambiguous', 'failed'))
    `.execute(db);

    await db.schema
        .createIndex('idx_source_instances_discovery_status')
        .on('source_instances')
        .columns(['adapter_key', 'discovery_status'])
        .execute();

    await db.schema
        .alterTable('source_resources')
        .addColumn('lifecycle', 'varchar', (col) =>
            col.notNull().defaultTo('active')
        )
        .execute();

    await sql`
        ALTER TABLE source_resources
        ADD CONSTRAINT ck_source_resources_lifecycle
        CHECK (lifecycle IN ('candidate', 'active', 'historical', 'blocked_pending_review'))
    `.execute(db);

    await db.schema
        .createIndex('idx_source_resources_lifecycle_enabled')
        .on('source_resources')
        .columns(['lifecycle', 'enabled'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropIndex('idx_source_resources_lifecycle_enabled').ifExists().execute();
    await db.schema.alterTable('source_resources').dropConstraint('ck_source_resources_lifecycle').execute();
    await db.schema.alterTable('source_resources').dropColumn('lifecycle').execute();

    await db.schema.dropIndex('idx_source_instances_discovery_status').ifExists().execute();
    await db.schema.alterTable('source_instances').dropConstraint('ck_source_instances_discovery_status').execute();
    await db.schema
        .alterTable('source_instances')
        .dropColumn('discovery_metadata')
        .dropColumn('last_discovery_error')
        .dropColumn('last_discovery_at')
        .dropColumn('discovery_status')
        .execute();
}
