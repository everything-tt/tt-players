import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('rating_models')
        .addColumn('window_start_date', 'date')
        .execute();

    await sql`
        CREATE FUNCTION rating_rubber_exclusion_reason(
            p_is_doubles boolean,
            p_outcome_type text,
            p_effective_date date,
            p_home_player_id uuid,
            p_away_player_id uuid,
            p_home_record_id uuid,
            p_away_record_id uuid,
            p_home_canonical_id uuid,
            p_away_canonical_id uuid,
            p_home_games_won integer,
            p_away_games_won integer
        ) RETURNS text
        LANGUAGE sql
        IMMUTABLE
        PARALLEL SAFE
        AS $$
            SELECT CASE
                WHEN p_is_doubles THEN 'doubles'
                WHEN p_outcome_type <> 'normal' THEN 'non_normal_outcome'
                WHEN p_effective_date IS NULL THEN 'missing_date'
                WHEN p_home_player_id IS NULL AND p_away_player_id IS NULL THEN 'missing_both_player_ids'
                WHEN p_home_player_id IS NULL THEN 'missing_home_player_id'
                WHEN p_away_player_id IS NULL THEN 'missing_away_player_id'
                WHEN p_home_record_id IS NULL AND p_away_record_id IS NULL THEN 'missing_both_player_records'
                WHEN p_home_record_id IS NULL THEN 'missing_home_player_record'
                WHEN p_away_record_id IS NULL THEN 'missing_away_player_record'
                WHEN p_home_canonical_id = p_away_canonical_id THEN 'same_canonical_player'
                WHEN p_home_games_won = p_away_games_won THEN 'tied_score'
                ELSE 'eligible'
            END
        $$
    `.execute(db);

    await sql`
        CREATE VIEW rating_rubber_classification AS
        SELECT
            rubber.id AS rubber_id,
            rubber.fixture_id,
            fixture.competition_id,
            league.platform_id,
            COALESCE(
                rubber.played_at::date,
                CASE WHEN fixture.deleted_at IS NULL THEN fixture.date_played END
            ) AS effective_date,
            rubber.is_doubles,
            rubber.outcome_type::text AS outcome_type,
            rubber.home_player_1_id,
            rubber.away_player_1_id,
            home_player.id AS home_player_record_id,
            away_player.id AS away_player_record_id,
            COALESCE(home_player.canonical_player_id, home_player.id) AS home_canonical_player_id,
            COALESCE(away_player.canonical_player_id, away_player.id) AS away_canonical_player_id,
            rubber.home_games_won,
            rubber.away_games_won,
            rating_rubber_exclusion_reason(
                rubber.is_doubles,
                rubber.outcome_type::text,
                COALESCE(
                    rubber.played_at::date,
                    CASE WHEN fixture.deleted_at IS NULL THEN fixture.date_played END
                ),
                rubber.home_player_1_id,
                rubber.away_player_1_id,
                home_player.id,
                away_player.id,
                COALESCE(home_player.canonical_player_id, home_player.id),
                COALESCE(away_player.canonical_player_id, away_player.id),
                rubber.home_games_won,
                rubber.away_games_won
            ) AS eligibility_reason
        FROM rubbers rubber
        LEFT JOIN fixtures fixture ON fixture.id = rubber.fixture_id
        LEFT JOIN competitions competition ON competition.id = fixture.competition_id
        LEFT JOIN seasons season ON season.id = competition.season_id
        LEFT JOIN leagues league ON league.id = season.league_id
        LEFT JOIN external_players home_player ON home_player.id = rubber.home_player_1_id
        LEFT JOIN external_players away_player ON away_player.id = rubber.away_player_1_id
        WHERE rubber.deleted_at IS NULL
    `.execute(db);

    await db.schema
        .createTable('rating_audit_issues')
        .addColumn('id', 'uuid', (col) => col.primaryKey().defaultTo(sql`gen_random_uuid()`))
        .addColumn('model_id', 'uuid', (col) =>
            col.notNull().references('rating_models.id').onDelete('cascade'))
        .addColumn('issue_type', 'varchar', (col) => col.notNull())
        .addColumn('severity', 'varchar', (col) => col.notNull())
        .addColumn('entity_type', 'varchar', (col) => col.notNull())
        .addColumn('entity_id', 'uuid', (col) => col.notNull())
        .addColumn('source_id', 'uuid', (col) => col.references('platforms.id').onDelete('set null'))
        .addColumn('competition_id', 'uuid', (col) => col.references('competitions.id').onDelete('set null'))
        .addColumn('match_date', 'date')
        .addColumn('details', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
        .addColumn('snapshot_generated_at', 'timestamp', (col) => col.notNull())
        .addColumn('first_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('last_seen_at', 'timestamp', (col) => col.notNull().defaultTo(sql`now()`))
        .addColumn('resolved_at', 'timestamp')
        .addUniqueConstraint('uq_rating_audit_issue_entity', [
            'model_id',
            'issue_type',
            'entity_type',
            'entity_id',
        ])
        .addCheckConstraint(
            'chk_rating_audit_issue_severity',
            sql`severity IN ('info', 'warning', 'critical')`,
        )
        .execute();

    await sql`
        CREATE INDEX idx_rating_audit_issues_active_type
        ON rating_audit_issues (model_id, issue_type, severity)
        WHERE resolved_at IS NULL
    `.execute(db);

    await db.schema
        .createIndex('idx_rating_audit_issues_source')
        .on('rating_audit_issues')
        .columns(['model_id', 'source_id', 'issue_type'])
        .execute();

    await db.schema
        .createIndex('idx_rating_audit_issues_competition')
        .on('rating_audit_issues')
        .columns(['model_id', 'competition_id', 'issue_type'])
        .execute();

    await db.schema
        .createIndex('idx_rating_audit_issues_match_date')
        .on('rating_audit_issues')
        .columns(['model_id', 'match_date'])
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema.dropTable('rating_audit_issues').ifExists().execute();
    await sql`DROP VIEW IF EXISTS rating_rubber_classification`.execute(db);
    await sql`DROP FUNCTION IF EXISTS rating_rubber_exclusion_reason(
        boolean, text, date, uuid, uuid, uuid, uuid, uuid, uuid, integer, integer
    )`.execute(db);
    await db.schema
        .alterTable('rating_models')
        .dropColumn('window_start_date')
        .execute();
}
