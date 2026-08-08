import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('competitions')
        .addColumn('description', 'text')
        .addColumn('venue_url', 'text')
        .addColumn('organizer_name', 'varchar')
        .addColumn('organizer_url', 'text')
        .addColumn('publication_status', 'varchar')
        .execute();

    await sql`
        ALTER TABLE competitions
        ADD CONSTRAINT chk_competitions_publication_status
        CHECK (
            publication_status IS NULL
            OR publication_status IN ('confirmed', 'provisional', 'cancelled', 'postponed')
        )
    `.execute(db);

    // TTE calendar raw payloads are authoritative for these source-owned fields.
    // Canonical competition columns are a query-friendly projection of the latest raw source.
    await sql`
        CREATE OR REPLACE FUNCTION refresh_competition_calendar_metadata(target_competition_id uuid)
        RETURNS void
        LANGUAGE plpgsql
        AS $$
        DECLARE
            source_payload jsonb;
            raw_publication_status text;
        BEGIN
            SELECT ts.raw_payload
            INTO source_payload
            FROM tournament_sources ts
            WHERE ts.competition_id = target_competition_id
              AND ts.provider = 'tte'
              AND ts.source_type = 'calendar'
            ORDER BY ts.last_seen_at DESC, ts.updated_at DESC
            LIMIT 1;

            IF source_payload IS NULL THEN
                UPDATE competitions
                SET
                    description = NULL,
                    venue_url = NULL,
                    organizer_name = NULL,
                    organizer_url = NULL,
                    publication_status = NULL
                WHERE id = target_competition_id;
                RETURN;
            END IF;

            raw_publication_status := lower(nullif(btrim(source_payload ->> 'publishedStatus'), ''));

            UPDATE competitions
            SET
                description = nullif(btrim(source_payload ->> 'description'), ''),
                venue_url = nullif(btrim(source_payload ->> 'venueUrl'), ''),
                organizer_name = nullif(btrim(source_payload ->> 'organizerName'), ''),
                organizer_url = nullif(btrim(source_payload ->> 'organizerUrl'), ''),
                publication_status = CASE
                    WHEN raw_publication_status IN ('confirmed', 'provisional', 'cancelled', 'postponed')
                        THEN raw_publication_status
                    ELSE NULL
                END
            WHERE id = target_competition_id;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE OR REPLACE FUNCTION sync_competition_calendar_metadata_from_source()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        BEGIN
            IF TG_OP IN ('UPDATE', 'DELETE')
               AND OLD.provider = 'tte'
               AND OLD.source_type = 'calendar' THEN
                PERFORM refresh_competition_calendar_metadata(OLD.competition_id);
            END IF;

            IF TG_OP IN ('INSERT', 'UPDATE')
               AND NEW.provider = 'tte'
               AND NEW.source_type = 'calendar' THEN
                PERFORM refresh_competition_calendar_metadata(NEW.competition_id);
            END IF;

            IF TG_OP = 'DELETE' THEN
                RETURN OLD;
            END IF;
            RETURN NEW;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_tournament_sources_sync_calendar_metadata
        AFTER INSERT OR DELETE OR UPDATE OF raw_payload, competition_id, provider, source_type
        ON tournament_sources
        FOR EACH ROW
        EXECUTE FUNCTION sync_competition_calendar_metadata_from_source()
    `.execute(db);

    // Backfill existing competitions from the raw records already stored in tournament_sources.
    await sql`
        WITH calendar_competitions AS (
            SELECT DISTINCT competition_id
            FROM tournament_sources
            WHERE provider = 'tte'
              AND source_type = 'calendar'
        )
        SELECT refresh_competition_calendar_metadata(competition_id)
        FROM calendar_competitions
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        DROP TRIGGER IF EXISTS trg_tournament_sources_sync_calendar_metadata
        ON tournament_sources
    `.execute(db);
    await sql`DROP FUNCTION IF EXISTS sync_competition_calendar_metadata_from_source()`.execute(db);
    await sql`DROP FUNCTION IF EXISTS refresh_competition_calendar_metadata(uuid)`.execute(db);
    await sql`
        ALTER TABLE competitions
        DROP CONSTRAINT IF EXISTS chk_competitions_publication_status
    `.execute(db);

    await db.schema
        .alterTable('competitions')
        .dropColumn('publication_status')
        .dropColumn('organizer_url')
        .dropColumn('organizer_name')
        .dropColumn('venue_url')
        .dropColumn('description')
        .execute();
}
