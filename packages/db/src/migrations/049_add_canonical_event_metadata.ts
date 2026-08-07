import { type Kysely, sql } from 'kysely';

const PUBLICATION_STATUSES = ['confirmed', 'provisional', 'cancelled', 'postponed'] as const;

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

    // TTE calendar source payloads are the authoritative source for these fields.
    // Keep the canonical competition columns synchronized whenever the raw source changes.
    await sql`
        CREATE OR REPLACE FUNCTION sync_competition_calendar_metadata_from_source()
        RETURNS trigger
        LANGUAGE plpgsql
        AS $$
        DECLARE
            raw_publication_status text;
        BEGIN
            IF NEW.provider = 'tte' AND NEW.source_type = 'calendar' THEN
                raw_publication_status := lower(nullif(btrim(NEW.raw_payload ->> 'publishedStatus'), ''));

                UPDATE competitions
                SET
                    description = nullif(btrim(NEW.raw_payload ->> 'description'), ''),
                    venue_url = nullif(btrim(NEW.raw_payload ->> 'venueUrl'), ''),
                    organizer_name = nullif(btrim(NEW.raw_payload ->> 'organizerName'), ''),
                    organizer_url = nullif(btrim(NEW.raw_payload ->> 'organizerUrl'), ''),
                    publication_status = CASE
                        WHEN raw_publication_status IN ('confirmed', 'provisional', 'cancelled', 'postponed')
                            THEN raw_publication_status
                        ELSE NULL
                    END
                WHERE id = NEW.competition_id;
            END IF;

            RETURN NEW;
        END;
        $$
    `.execute(db);

    await sql`
        CREATE TRIGGER trg_tournament_sources_sync_calendar_metadata
        AFTER INSERT OR UPDATE OF raw_payload, competition_id, provider, source_type
        ON tournament_sources
        FOR EACH ROW
        EXECUTE FUNCTION sync_competition_calendar_metadata_from_source()
    `.execute(db);

    // Backfill existing competitions from the latest stored raw TTE calendar payload.
    await sql`
        WITH latest_calendar_source AS (
            SELECT DISTINCT ON (competition_id)
                competition_id,
                raw_payload
            FROM tournament_sources
            WHERE provider = 'tte'
              AND source_type = 'calendar'
            ORDER BY competition_id, last_seen_at DESC, updated_at DESC
        )
        UPDATE competitions AS c
        SET
            description = nullif(btrim(source.raw_payload ->> 'description'), ''),
            venue_url = nullif(btrim(source.raw_payload ->> 'venueUrl'), ''),
            organizer_name = nullif(btrim(source.raw_payload ->> 'organizerName'), ''),
            organizer_url = nullif(btrim(source.raw_payload ->> 'organizerUrl'), ''),
            publication_status = CASE
                WHEN lower(nullif(btrim(source.raw_payload ->> 'publishedStatus'), ''))
                    IN ('confirmed', 'provisional', 'cancelled', 'postponed')
                    THEN lower(nullif(btrim(source.raw_payload ->> 'publishedStatus'), ''))
                ELSE NULL
            END
        FROM latest_calendar_source AS source
        WHERE c.id = source.competition_id
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        DROP TRIGGER IF EXISTS trg_tournament_sources_sync_calendar_metadata
        ON tournament_sources
    `.execute(db);
    await sql`DROP FUNCTION IF EXISTS sync_competition_calendar_metadata_from_source()`.execute(db);
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

void PUBLICATION_STATUSES;
