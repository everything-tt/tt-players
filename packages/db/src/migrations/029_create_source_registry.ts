import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('source_instances')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`)
        )
        .addColumn('platform_id', 'uuid', (col) =>
            col.notNull().references('platforms.id').onDelete('cascade')
        )
        .addColumn('key', 'varchar', (col) => col.notNull())
        .addColumn('name', 'varchar', (col) => col.notNull())
        .addColumn('base_url', 'varchar', (col) => col.notNull())
        .addColumn('adapter_key', 'varchar', (col) => col.notNull())
        .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
        .addColumn('config', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('first_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('last_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_source_instances_platform_key', ['platform_id', 'key'])
        .execute();

    await db.schema
        .createIndex('idx_source_instances_adapter_enabled')
        .on('source_instances')
        .columns(['adapter_key', 'enabled'])
        .execute();

    await db.schema
        .createTable('source_resources')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`)
        )
        .addColumn('source_instance_id', 'uuid', (col) =>
            col.notNull().references('source_instances.id').onDelete('cascade')
        )
        .addColumn('resource_type', 'varchar', (col) => col.notNull())
        .addColumn('external_id', 'varchar', (col) => col.notNull())
        .addColumn('name', 'varchar')
        .addColumn('public_url', 'varchar')
        .addColumn('adapter_version', 'varchar', (col) => col.notNull())
        .addColumn('refresh_policy', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('enabled', 'boolean', (col) => col.notNull().defaultTo(true))
        .addColumn('league_id', 'uuid', (col) =>
            col.references('leagues.id').onDelete('set null')
        )
        .addColumn('season_id', 'uuid', (col) =>
            col.references('seasons.id').onDelete('set null')
        )
        .addColumn('competition_id', 'uuid', (col) =>
            col.references('competitions.id').onDelete('set null')
        )
        .addColumn('last_fetched_at', 'timestamp')
        .addColumn('last_succeeded_at', 'timestamp')
        .addColumn('last_parsed_at', 'timestamp')
        .addColumn('last_error', 'text')
        .addColumn('consecutive_failures', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addUniqueConstraint('uq_source_resources_instance_type_external', [
            'source_instance_id',
            'resource_type',
            'external_id',
        ])
        .addCheckConstraint(
            'ck_source_resources_consecutive_failures_nonnegative',
            sql`consecutive_failures >= 0`,
        )
        .execute();

    await db.schema
        .createIndex('idx_source_resources_enabled_type')
        .on('source_resources')
        .columns(['enabled', 'resource_type'])
        .execute();

    await db.schema
        .createIndex('idx_source_resources_health')
        .on('source_resources')
        .columns(['last_succeeded_at', 'consecutive_failures'])
        .execute();

    await db.schema
        .createIndex('idx_source_resources_competition')
        .on('source_resources')
        .column('competition_id')
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('source_resources').ifExists().execute();
    await db.schema.dropTable('source_instances').ifExists().execute();
}
