import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .createTable('rating_models')
        .addColumn('id', 'uuid', (col) =>
            col.primaryKey().defaultTo(sql`gen_random_uuid()`)
        )
        .addColumn('key', 'varchar', (col) => col.notNull().unique())
        .addColumn('algorithm', 'varchar', (col) => col.notNull())
        .addColumn('config', 'jsonb', (col) => col.notNull())
        .addColumn('is_active', 'boolean', (col) => col.notNull().defaultTo(false))
        .addColumn('created_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();

    await db.schema
        .createTable('player_ratings')
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade')
        )
        .addColumn('player_id', 'uuid', (col) =>
            col.notNull().references('external_players.id').onDelete('cascade')
        )
        .addColumn('rating', 'double precision', (col) => col.notNull())
        .addColumn('rating_deviation', 'double precision', (col) => col.notNull())
        .addColumn('volatility', 'double precision', (col) => col.notNull())
        .addColumn('conservative_rating', 'double precision', (col) => col.notNull())
        .addColumn('rated_matches', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('rated_wins', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('rated_losses', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('first_rated_at', 'date')
        .addColumn('last_rated_at', 'date')
        .addColumn('provisional', 'boolean', (col) => col.notNull().defaultTo(true))
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addPrimaryKeyConstraint('pk_player_ratings', ['model_id', 'player_id'])
        .execute();

    await db.schema
        .createIndex('idx_player_ratings_leaderboard')
        .on('player_ratings')
        .columns(['model_id', 'provisional', 'conservative_rating'])
        .execute();

    await db.schema
        .createIndex('idx_player_ratings_last_rated')
        .on('player_ratings')
        .columns(['model_id', 'last_rated_at'])
        .execute();

    await sql`
        CREATE INDEX idx_rubbers_rating_played_at
        ON rubbers (played_at, id)
        WHERE deleted_at IS NULL
          AND played_at IS NOT NULL
          AND is_doubles = false
          AND outcome_type = 'normal'
          AND home_player_1_id IS NOT NULL
          AND away_player_1_id IS NOT NULL
          AND home_games_won <> away_games_won
    `.execute(db);

    await sql`
        CREATE INDEX idx_rubbers_rating_fixture_fallback
        ON rubbers (fixture_id, id)
        WHERE deleted_at IS NULL
          AND played_at IS NULL
          AND is_doubles = false
          AND outcome_type = 'normal'
          AND home_player_1_id IS NOT NULL
          AND away_player_1_id IS NOT NULL
          AND home_games_won <> away_games_won
    `.execute(db);

    await db.schema
        .createTable('rating_processing_state')
        .addColumn('model_id', 'uuid', (col) =>
            col.primaryKey().references('rating_models.id').onDelete('cascade')
        )
        .addColumn('last_processed_date', 'date')
        .addColumn('status', 'varchar', (col) => col.notNull().defaultTo('idle'))
        .addColumn('processed_periods', 'integer', (col) => col.notNull().defaultTo(0))
        .addColumn('processed_matches', 'bigint', (col) => col.notNull().defaultTo(0))
        .addColumn('last_error', 'text')
        .addColumn('started_at', 'timestamp')
        .addColumn('finished_at', 'timestamp')
        .addColumn('updated_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .execute();

    await sql`
        INSERT INTO rating_models (key, algorithm, config, is_active)
        VALUES (
            'global-singles-glicko2-v1',
            'glicko2',
            ${JSON.stringify({
                initialRating: 1500,
                initialDeviation: 350,
                initialVolatility: 0.06,
                tau: 0.5,
                ratingScale: 173.7178,
                conservativeDeviationMultiplier: 2,
                provisionalMatches: 10,
                provisionalDeviation: 110,
                batchSize: 250,
            })}::jsonb,
            true
        )
        ON CONFLICT (key) DO NOTHING
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_rubbers_rating_fixture_fallback`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_rubbers_rating_played_at`.execute(db);
    await db.schema.dropTable('rating_processing_state').ifExists().execute();
    await db.schema.dropTable('player_ratings').ifExists().execute();
    await db.schema.dropTable('rating_models').ifExists().execute();
}
