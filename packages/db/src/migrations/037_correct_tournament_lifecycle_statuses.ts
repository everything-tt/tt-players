import { sql, type Kysely } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        ALTER TABLE competitions
        ALTER COLUMN event_status SET DEFAULT 'completed'
    `.execute(db);

    await sql`
        UPDATE competitions
        SET event_status = 'completed'
        WHERE type = 'individual'
          AND source IS DISTINCT FROM 'tte-calendar'
          AND event_status = 'upcoming'
    `.execute(db);

    await sql`
        UPDATE competitions
        SET event_status = 'completed'
        WHERE type = 'individual'
          AND source = 'tte-calendar'
          AND status_override IS NULL
          AND event_status IN ('upcoming', 'entries_open', 'entries_closed', 'in_progress')
          AND COALESCE(end_date, start_date, event_date) < CURRENT_DATE
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        ALTER TABLE competitions
        ALTER COLUMN event_status SET DEFAULT 'upcoming'
    `.execute(db);
}
