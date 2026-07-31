import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('data_versions')
        .addColumn('key', 'text', (col) => col.primaryKey())
        .addColumn('version', 'bigint', (col) => col.notNull().defaultTo(0))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();

    await db
        .insertInto('data_versions')
        .values([
            { key: 'player-results', version: 1 },
            { key: 'ratings', version: 1 },
            { key: 'source-quality', version: 1 },
        ])
        .execute();

    await db.schema
        .createTable('source_quality_snapshots')
        .addColumn('key', 'text', (col) => col.primaryKey())
        .addColumn('content', 'jsonb', (col) => col.notNull())
        .addColumn('generated_at', 'timestamp', (col) => col.notNull())
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();

    await db.schema
        .createTable('player_active_leagues')
        .addColumn('player_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade'))
        .addColumn('league_id', 'uuid', (col) =>
            col.notNull().references('leagues.id').onDelete('cascade'))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addPrimaryKeyConstraint('pk_player_active_leagues', ['player_id', 'league_id'])
        .execute();

    await db.schema
        .createIndex('idx_player_active_leagues_league_player')
        .on('player_active_leagues')
        .columns(['league_id', 'player_id'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('player_active_leagues').ifExists().execute();
    await db.schema.dropTable('source_quality_snapshots').ifExists().execute();
    await db.schema.dropTable('data_versions').ifExists().execute();
}
