import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    // Earlier code used check-then-insert for pending review candidates. Remove
    // any historical duplicates before making that logical identity enforceable.
    await sql`
        WITH ranked AS (
            SELECT
                id,
                row_number() OVER (
                    PARTITION BY incoming_provider, incoming_external_id, candidate_competition_id
                    ORDER BY created_at ASC, id ASC
                ) AS duplicate_rank
            FROM tournament_match_candidates
            WHERE status = 'pending'
              AND incoming_external_id IS NOT NULL
        )
        DELETE FROM tournament_match_candidates candidate
        USING ranked
        WHERE candidate.id = ranked.id
          AND ranked.duplicate_rank > 1
    `.execute(db);

    await sql`
        CREATE UNIQUE INDEX uq_tournament_match_candidates_pending_identity
        ON tournament_match_candidates (
            incoming_provider,
            incoming_external_id,
            candidate_competition_id
        )
        WHERE status = 'pending'
          AND incoming_external_id IS NOT NULL
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        DROP INDEX IF EXISTS uq_tournament_match_candidates_pending_identity
    `.execute(db);
}
