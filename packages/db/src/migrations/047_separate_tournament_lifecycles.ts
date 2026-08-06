import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        ALTER TABLE competitions
            ADD COLUMN record_kind varchar,
            ADD COLUMN matched_calendar_competition_id uuid
                REFERENCES competitions(id) ON DELETE SET NULL,
            ADD COLUMN processed_at timestamp
    `.execute(db);

    await sql`
        UPDATE competitions
        SET record_kind = CASE
            WHEN type = 'individual' AND source = 'tte-calendar' THEN 'calendar'
            ELSE 'result'
        END
    `.execute(db);

    await sql`
        CREATE TEMP TABLE tournament_calendar_split (
            result_id uuid PRIMARY KEY,
            calendar_id uuid NOT NULL
        ) ON COMMIT DROP
    `.execute(db);

    await sql`
        WITH mixed AS (
            SELECT c.*
            FROM competitions c
            WHERE c.type = 'individual'
              AND c.source = 'tte-calendar'
              AND (
                  EXISTS (
                      SELECT 1
                      FROM tournament_sources ts
                      WHERE ts.competition_id = c.id
                        AND ts.source_type = 'results'
                  )
                  OR EXISTS (
                      SELECT 1
                      FROM fixtures f
                      WHERE f.competition_id = c.id
                        AND f.deleted_at IS NULL
                  )
              )
        ), inserted AS (
            INSERT INTO competitions (
                season_id,
                external_id,
                name,
                type,
                last_scraped_at,
                created_at,
                deleted_at,
                display_name,
                event_date,
                category,
                source,
                source_url,
                start_date,
                end_date,
                venue_name,
                venue_address,
                venue_town,
                venue_postcode,
                entry_deadline,
                entry_url,
                information_url,
                event_status,
                status_override,
                normalized_name,
                normalized_venue,
                calendar_first_seen_at,
                calendar_last_seen_at,
                calendar_missing_count,
                record_kind,
                processed_at
            )
            SELECT
                c.season_id,
                c.external_id || ':calendar:' || left(c.id::text, 8),
                c.name,
                c.type,
                NULL,
                c.created_at,
                c.deleted_at,
                c.display_name,
                c.event_date,
                c.category,
                'tte-calendar',
                c.information_url,
                c.start_date,
                c.end_date,
                c.venue_name,
                c.venue_address,
                c.venue_town,
                c.venue_postcode,
                c.entry_deadline,
                c.entry_url,
                c.information_url,
                'processed',
                NULL,
                c.normalized_name,
                c.normalized_venue,
                c.calendar_first_seen_at,
                c.calendar_last_seen_at,
                c.calendar_missing_count,
                'calendar',
                now()
            FROM mixed c
            RETURNING id, external_id
        )
        INSERT INTO tournament_calendar_split (result_id, calendar_id)
        SELECT mixed.id, inserted.id
        FROM mixed
        JOIN inserted
          ON inserted.external_id = mixed.external_id || ':calendar:' || left(mixed.id::text, 8)
    `.execute(db);

    await sql`
        UPDATE tournament_sources ts
        SET competition_id = split.calendar_id,
            updated_at = now()
        FROM tournament_calendar_split split
        WHERE ts.competition_id = split.result_id
          AND ts.source_type = 'calendar'
    `.execute(db);

    await sql`
        UPDATE tournament_match_candidates candidate
        SET candidate_competition_id = split.calendar_id,
            updated_at = now()
        FROM tournament_calendar_split split
        WHERE candidate.candidate_competition_id = split.result_id
    `.execute(db);

    await sql`
        UPDATE competitions result
        SET record_kind = 'result',
            event_status = 'completed',
            matched_calendar_competition_id = split.calendar_id,
            processed_at = NULL
        FROM tournament_calendar_split split
        WHERE result.id = split.result_id
    `.execute(db);

    await sql`
        UPDATE competitions
        SET event_status = 'awaiting_results'
        WHERE record_kind = 'calendar'
          AND processed_at IS NULL
          AND event_status = 'completed'
    `.execute(db);

    await sql`
        ALTER TABLE competitions
            ALTER COLUMN record_kind SET DEFAULT 'result',
            ALTER COLUMN record_kind SET NOT NULL,
            ADD CONSTRAINT chk_competitions_record_kind
                CHECK (record_kind IN ('calendar', 'result'))
    `.execute(db);

    await sql`
        CREATE INDEX idx_competitions_record_kind_event_date
        ON competitions (record_kind, event_date)
        WHERE deleted_at IS NULL AND type = 'individual'
    `.execute(db);

    await sql`
        CREATE INDEX idx_competitions_calendar_unprocessed
        ON competitions (processed_at, start_date)
        WHERE deleted_at IS NULL
          AND type = 'individual'
          AND record_kind = 'calendar'
    `.execute(db);

    await sql`
        CREATE INDEX idx_competitions_matched_calendar
        ON competitions (matched_calendar_competition_id)
        WHERE matched_calendar_competition_id IS NOT NULL
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`DROP INDEX IF EXISTS idx_competitions_matched_calendar`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_competitions_calendar_unprocessed`.execute(db);
    await sql`DROP INDEX IF EXISTS idx_competitions_record_kind_event_date`.execute(db);
    await sql`ALTER TABLE competitions DROP CONSTRAINT IF EXISTS chk_competitions_record_kind`.execute(db);
    await db.schema
        .alterTable('competitions')
        .dropColumn('processed_at')
        .dropColumn('matched_calendar_competition_id')
        .dropColumn('record_kind')
        .execute();
}
