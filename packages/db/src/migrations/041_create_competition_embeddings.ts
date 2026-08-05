import { type Kysely, sql } from 'kysely';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        CREATE TABLE staging.competition_embeddings (
            competition_id uuid PRIMARY KEY
                REFERENCES public.competitions(id)
                ON DELETE CASCADE,
            provider varchar NOT NULL,
            model varchar NOT NULL,
            dimensions integer NOT NULL CHECK (dimensions > 0),
            input_text text NOT NULL,
            input_hash varchar NOT NULL,
            embedding jsonb NOT NULL,
            created_at timestamp NOT NULL DEFAULT now(),
            updated_at timestamp NOT NULL DEFAULT now()
        )
    `.execute(db);

    await sql`
        CREATE INDEX idx_competition_embeddings_model
        ON staging.competition_embeddings (provider, model, dimensions)
    `.execute(db);

    await db.schema
        .alterTable('tournament_match_candidates')
        .addColumn('embedding_score', 'numeric')
        .addColumn('score_evidence', 'jsonb', (col) =>
            col.notNull().defaultTo(sql`'{}'::jsonb`),
        )
        .execute();
}

export async function down(db: Kysely<any>): Promise<void> {
    await db.schema
        .alterTable('tournament_match_candidates')
        .dropColumn('score_evidence')
        .dropColumn('embedding_score')
        .execute();

    await sql`DROP INDEX IF EXISTS staging.idx_competition_embeddings_model`.execute(db);
    await sql`DROP TABLE IF EXISTS staging.competition_embeddings`.execute(db);
}
