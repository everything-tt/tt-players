import { type Kysely, sql } from 'kysely';

const MODEL_KEY = 'global-singles-glicko2-v1';

export async function up(db: Kysely<any>): Promise<void> {
    await sql`
        ALTER TABLE rating_ranking_policies
        ALTER COLUMN minimum_matches SET DEFAULT 0
    `.execute(db);

    await sql`
        UPDATE rating_ranking_policies policy
        SET minimum_matches = 0,
            updated_at = now()
        FROM rating_models model
        WHERE model.id = policy.model_id
          AND model.key = ${MODEL_KEY}
    `.execute(db);

    await sql`
        UPDATE rating_models
        SET config = jsonb_set(config, '{provisionalMatches}', '0'::jsonb, true),
            updated_at = now()
        WHERE key = ${MODEL_KEY}
    `.execute(db);

    await sql`
        UPDATE player_ratings rating
        SET provisional = rating.rating_deviation > COALESCE(
                (model.config ->> 'provisionalDeviation')::double precision,
                110
            ),
            updated_at = now()
        FROM rating_models model
        WHERE model.id = rating.model_id
          AND model.key = ${MODEL_KEY}
    `.execute(db);
}

export async function down(db: Kysely<any>): Promise<void> {
    await sql`
        ALTER TABLE rating_ranking_policies
        ALTER COLUMN minimum_matches SET DEFAULT 10
    `.execute(db);

    await sql`
        UPDATE rating_ranking_policies policy
        SET minimum_matches = 10,
            updated_at = now()
        FROM rating_models model
        WHERE model.id = policy.model_id
          AND model.key = ${MODEL_KEY}
    `.execute(db);

    await sql`
        UPDATE rating_models
        SET config = jsonb_set(config, '{provisionalMatches}', '10'::jsonb, true),
            updated_at = now()
        WHERE key = ${MODEL_KEY}
    `.execute(db);

    await sql`
        UPDATE player_ratings rating
        SET provisional = rating.rated_matches < 10
            OR rating.rating_deviation > COALESCE(
                (model.config ->> 'provisionalDeviation')::double precision,
                110
            ),
            updated_at = now()
        FROM rating_models model
        WHERE model.id = rating.model_id
          AND model.key = ${MODEL_KEY}
    `.execute(db);
}
