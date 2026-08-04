import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY, toDateString } from '../ratings/domain.js';

const QuerySchema = z.object({
    model: z.string().min(1).default(DEFAULT_RATING_MODEL_KEY),
});

const ModelHealthSchema = z.object({
    key: z.string(),
    status: z.string().nullable(),
    last_processed_date: z.string().nullable(),
    processed_periods: z.number().int(),
    processed_matches: z.number().int(),
    updated_at: z.string().nullable(),
    rated_players: z.number().int(),
    established_players: z.number().int(),
    provisional_players: z.number().int(),
    average_deviation: z.number(),
    first_rated_date: z.string().nullable(),
    last_rated_date: z.string().nullable(),
});

const DataHealthSchema = z.object({
    stored_rubbers: z.number().int(),
    active_rubbers: z.number().int(),
    eligible_singles: z.number().int(),
    excluded_rubbers: z.number().int(),
    doubles: z.number().int(),
    non_normal_outcome: z.number().int(),
    missing_date: z.number().int(),
    missing_identity: z.number().int(),
    same_canonical_player: z.number().int(),
    tied_score: z.number().int(),
});

const IdentityHealthSchema = z.object({
    source_records: z.number().int(),
    active_records: z.number().int(),
    canonical_players: z.number().int(),
    linked_aliases: z.number().int(),
    active_aliases: z.number().int(),
    soft_deleted_aliases: z.number().int(),
    unassigned_records: z.number().int(),
    broken_targets: z.number().int(),
    chained_links: z.number().int(),
    deleted_targets: z.number().int(),
    same_name_candidate_groups: z.number().int(),
    multi_source_players: z.number().int(),
});

const NetworkHealthSchema = z.object({
    eligible_matches: z.number().int(),
    connected_players: z.number().int(),
    unique_pairings: z.number().int(),
    average_unique_opponents: z.number(),
    maximum_unique_opponents: z.number().int(),
    one_opponent_players: z.number().int(),
    three_or_fewer_opponent_players: z.number().int(),
    competitions: z.number().int(),
    first_match_date: z.string().nullable(),
    last_match_date: z.string().nullable(),
});

const NetworkAnomalySchema = z.object({
    player_id: z.string().uuid(),
    player_name: z.string(),
    rating: z.number(),
    rating_deviation: z.number(),
    rated_matches: z.number().int(),
    unique_opponents: z.number().int(),
    provisional: z.boolean(),
});

interface ModelHealthRow {
    key: string;
    status: string | null;
    last_processed_date: string | Date | null;
    processed_periods: number | string | null;
    processed_matches: number | string | null;
    updated_at: Date | null;
    rated_players: number | string;
    established_players: number | string;
    provisional_players: number | string;
    average_deviation: number | string | null;
    first_rated_date: string | Date | null;
    last_rated_date: string | Date | null;
}

interface DataHealthRow {
    stored_rubbers: number | string;
    active_rubbers: number | string;
    eligible_singles: number | string;
    doubles: number | string;
    non_normal_outcome: number | string;
    missing_date: number | string;
    missing_identity: number | string;
    same_canonical_player: number | string;
    tied_score: number | string;
}

interface IdentityHealthRow {
    source_records: number | string;
    active_records: number | string;
    canonical_players: number | string;
    linked_aliases: number | string;
    active_aliases: number | string;
    soft_deleted_aliases: number | string;
    unassigned_records: number | string;
    broken_targets: number | string;
    chained_links: number | string;
    deleted_targets: number | string;
    same_name_candidate_groups: number | string;
    multi_source_players: number | string;
}

interface NetworkHealthRow {
    eligible_matches: number | string;
    connected_players: number | string;
    unique_pairings: number | string;
    average_unique_opponents: number | string | null;
    maximum_unique_opponents: number | string | null;
    one_opponent_players: number | string;
    three_or_fewer_opponent_players: number | string;
    competitions: number | string;
    first_match_date: string | Date | null;
    last_match_date: string | Date | null;
}

interface NetworkAnomalyRow {
    player_id: string;
    player_name: string;
    rating: number | string;
    rating_deviation: number | string;
    rated_matches: number | string;
    unique_opponents: number | string;
    provisional: boolean;
}

export function ratingAuditRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/audit/summary',
            {
                schema: {
                    querystring: QuerySchema,
                    response: {
                        200: z.object({
                            model: ModelHealthSchema,
                            data: DataHealthSchema,
                            identities: IdentityHealthSchema,
                            network: NetworkHealthSchema,
                            network_anomalies: z.array(NetworkAnomalySchema),
                        }),
                        404: z.object({ error: z.string(), statusCode: z.number().int() }),
                    },
                },
            },
            async (request, reply) => {
                const { model } = request.query;

                const [modelResult, dataResult, identityResult, networkResult, anomalyResult] = await Promise.all([
                    sql<ModelHealthRow>`
                        SELECT
                            rm.key,
                            rps.status,
                            rps.last_processed_date,
                            COALESCE(rps.processed_periods, 0)::int AS processed_periods,
                            COALESCE(rps.processed_matches, 0)::int AS processed_matches,
                            rps.updated_at,
                            COUNT(pr.player_id)::int AS rated_players,
                            COUNT(pr.player_id) FILTER (WHERE pr.provisional = false)::int AS established_players,
                            COUNT(pr.player_id) FILTER (WHERE pr.provisional = true)::int AS provisional_players,
                            COALESCE(AVG(pr.rating_deviation), 0) AS average_deviation,
                            MIN(pr.first_rated_at) AS first_rated_date,
                            MAX(pr.last_rated_at) AS last_rated_date
                        FROM rating_models rm
                        LEFT JOIN rating_processing_state rps ON rps.model_id = rm.id
                        LEFT JOIN player_ratings pr ON pr.model_id = rm.id
                        WHERE rm.key = ${model}
                        GROUP BY
                            rm.key,
                            rps.status,
                            rps.last_processed_date,
                            rps.processed_periods,
                            rps.processed_matches,
                            rps.updated_at
                    `.execute(db),
                    sql<DataHealthRow>`
                        WITH classified AS (
                            SELECT
                                CASE
                                    WHEN r.is_doubles THEN 'doubles'
                                    WHEN r.outcome_type <> 'normal' THEN 'non_normal_outcome'
                                    WHEN COALESCE(r.played_at::date, CASE WHEN f.deleted_at IS NULL THEN f.date_played END) IS NULL THEN 'missing_date'
                                    WHEN r.home_player_1_id IS NULL OR r.away_player_1_id IS NULL
                                      OR home_player.id IS NULL OR away_player.id IS NULL THEN 'missing_identity'
                                    WHEN COALESCE(home_player.canonical_player_id, home_player.id)
                                       = COALESCE(away_player.canonical_player_id, away_player.id) THEN 'same_canonical_player'
                                    WHEN r.home_games_won = r.away_games_won THEN 'tied_score'
                                    ELSE 'eligible'
                                END AS reason
                            FROM rubbers r
                            LEFT JOIN fixtures f ON f.id = r.fixture_id
                            LEFT JOIN external_players home_player ON home_player.id = r.home_player_1_id
                            LEFT JOIN external_players away_player ON away_player.id = r.away_player_1_id
                            WHERE r.deleted_at IS NULL
                        )
                        SELECT
                            (SELECT COUNT(*)::int FROM rubbers) AS stored_rubbers,
                            COUNT(*)::int AS active_rubbers,
                            COUNT(*) FILTER (WHERE reason = 'eligible')::int AS eligible_singles,
                            COUNT(*) FILTER (WHERE reason = 'doubles')::int AS doubles,
                            COUNT(*) FILTER (WHERE reason = 'non_normal_outcome')::int AS non_normal_outcome,
                            COUNT(*) FILTER (WHERE reason = 'missing_date')::int AS missing_date,
                            COUNT(*) FILTER (WHERE reason = 'missing_identity')::int AS missing_identity,
                            COUNT(*) FILTER (WHERE reason = 'same_canonical_player')::int AS same_canonical_player,
                            COUNT(*) FILTER (WHERE reason = 'tied_score')::int AS tied_score
                        FROM classified
                    `.execute(db),
                    sql<IdentityHealthRow>`
                        WITH identity_rows AS (
                            SELECT
                                ep.*,
                                target.id AS target_id,
                                target.deleted_at AS target_deleted_at,
                                target.canonical_player_id AS target_canonical_player_id
                            FROM external_players ep
                            LEFT JOIN external_players target ON target.id = ep.canonical_player_id
                        ),
                        same_name_groups AS (
                            SELECT lower(regexp_replace(trim(name), '\\s+', ' ', 'g')) AS normalized_name
                            FROM external_players
                            WHERE deleted_at IS NULL
                              AND COALESCE(canonical_player_id, id) = id
                            GROUP BY lower(regexp_replace(trim(name), '\\s+', ' ', 'g'))
                            HAVING COUNT(*) > 1
                        ),
                        platform_groups AS (
                            SELECT COALESCE(canonical_player_id, id) AS canonical_id
                            FROM external_players
                            GROUP BY COALESCE(canonical_player_id, id)
                            HAVING COUNT(DISTINCT platform_id) > 1
                        )
                        SELECT
                            COUNT(*)::int AS source_records,
                            COUNT(*) FILTER (WHERE deleted_at IS NULL)::int AS active_records,
                            COUNT(*) FILTER (
                                WHERE deleted_at IS NULL
                                  AND COALESCE(canonical_player_id, id) = id
                            )::int AS canonical_players,
                            COUNT(*) FILTER (WHERE canonical_player_id IS DISTINCT FROM id)::int AS linked_aliases,
                            COUNT(*) FILTER (
                                WHERE canonical_player_id IS DISTINCT FROM id
                                  AND deleted_at IS NULL
                            )::int AS active_aliases,
                            COUNT(*) FILTER (
                                WHERE canonical_player_id IS DISTINCT FROM id
                                  AND deleted_at IS NOT NULL
                            )::int AS soft_deleted_aliases,
                            COUNT(*) FILTER (WHERE canonical_player_id IS NULL)::int AS unassigned_records,
                            COUNT(*) FILTER (
                                WHERE canonical_player_id IS NOT NULL
                                  AND target_id IS NULL
                            )::int AS broken_targets,
                            COUNT(*) FILTER (
                                WHERE canonical_player_id IS DISTINCT FROM id
                                  AND target_canonical_player_id IS NOT NULL
                                  AND target_canonical_player_id IS DISTINCT FROM target_id
                            )::int AS chained_links,
                            COUNT(*) FILTER (
                                WHERE canonical_player_id IS NOT NULL
                                  AND target_deleted_at IS NOT NULL
                            )::int AS deleted_targets,
                            (SELECT COUNT(*)::int FROM same_name_groups) AS same_name_candidate_groups,
                            (SELECT COUNT(*)::int FROM platform_groups) AS multi_source_players
                        FROM identity_rows
                    `.execute(db),
                    sql<NetworkHealthRow>`
                        WITH eligible AS (
                            SELECT
                                r.id,
                                f.competition_id,
                                COALESCE(r.played_at::date, CASE WHEN f.deleted_at IS NULL THEN f.date_played END) AS match_date,
                                COALESCE(home_player.canonical_player_id, home_player.id) AS home_player_id,
                                COALESCE(away_player.canonical_player_id, away_player.id) AS away_player_id
                            FROM rubbers r
                            LEFT JOIN fixtures f ON f.id = r.fixture_id
                            JOIN external_players home_player ON home_player.id = r.home_player_1_id
                            JOIN external_players away_player ON away_player.id = r.away_player_1_id
                            WHERE r.deleted_at IS NULL
                              AND r.is_doubles = false
                              AND r.outcome_type = 'normal'
                              AND COALESCE(r.played_at::date, CASE WHEN f.deleted_at IS NULL THEN f.date_played END) IS NOT NULL
                              AND r.home_games_won <> r.away_games_won
                              AND COALESCE(home_player.canonical_player_id, home_player.id)
                                  <> COALESCE(away_player.canonical_player_id, away_player.id)
                        ),
                        directed_edges AS (
                            SELECT home_player_id AS player_id, away_player_id AS opponent_id FROM eligible
                            UNION
                            SELECT away_player_id AS player_id, home_player_id AS opponent_id FROM eligible
                        ),
                        degrees AS (
                            SELECT player_id, COUNT(*)::int AS unique_opponents
                            FROM directed_edges
                            GROUP BY player_id
                        ),
                        pairings AS (
                            SELECT
                                LEAST(home_player_id, away_player_id) AS player_a,
                                GREATEST(home_player_id, away_player_id) AS player_b
                            FROM eligible
                            GROUP BY
                                LEAST(home_player_id, away_player_id),
                                GREATEST(home_player_id, away_player_id)
                        )
                        SELECT
                            (SELECT COUNT(*)::int FROM eligible) AS eligible_matches,
                            COUNT(*)::int AS connected_players,
                            (SELECT COUNT(*)::int FROM pairings) AS unique_pairings,
                            COALESCE(AVG(unique_opponents), 0) AS average_unique_opponents,
                            COALESCE(MAX(unique_opponents), 0)::int AS maximum_unique_opponents,
                            COUNT(*) FILTER (WHERE unique_opponents = 1)::int AS one_opponent_players,
                            COUNT(*) FILTER (WHERE unique_opponents <= 3)::int AS three_or_fewer_opponent_players,
                            (SELECT COUNT(DISTINCT competition_id)::int FROM eligible) AS competitions,
                            (SELECT MIN(match_date) FROM eligible) AS first_match_date,
                            (SELECT MAX(match_date) FROM eligible) AS last_match_date
                        FROM degrees
                    `.execute(db),
                    sql<NetworkAnomalyRow>`
                        WITH eligible AS (
                            SELECT
                                COALESCE(home_player.canonical_player_id, home_player.id) AS home_player_id,
                                COALESCE(away_player.canonical_player_id, away_player.id) AS away_player_id
                            FROM rubbers r
                            LEFT JOIN fixtures f ON f.id = r.fixture_id
                            JOIN external_players home_player ON home_player.id = r.home_player_1_id
                            JOIN external_players away_player ON away_player.id = r.away_player_1_id
                            WHERE r.deleted_at IS NULL
                              AND r.is_doubles = false
                              AND r.outcome_type = 'normal'
                              AND COALESCE(r.played_at::date, CASE WHEN f.deleted_at IS NULL THEN f.date_played END) IS NOT NULL
                              AND r.home_games_won <> r.away_games_won
                              AND COALESCE(home_player.canonical_player_id, home_player.id)
                                  <> COALESCE(away_player.canonical_player_id, away_player.id)
                        ),
                        directed_edges AS (
                            SELECT home_player_id AS player_id, away_player_id AS opponent_id FROM eligible
                            UNION
                            SELECT away_player_id AS player_id, home_player_id AS opponent_id FROM eligible
                        ),
                        degrees AS (
                            SELECT player_id, COUNT(*)::int AS unique_opponents
                            FROM directed_edges
                            GROUP BY player_id
                        )
                        SELECT
                            pr.player_id,
                            ep.name AS player_name,
                            pr.rating,
                            pr.rating_deviation,
                            pr.rated_matches,
                            COALESCE(degrees.unique_opponents, 0)::int AS unique_opponents,
                            pr.provisional
                        FROM player_ratings pr
                        JOIN rating_models rm ON rm.id = pr.model_id
                        JOIN external_players ep ON ep.id = pr.player_id
                        LEFT JOIN degrees ON degrees.player_id = pr.player_id
                        WHERE rm.key = ${model}
                          AND ep.deleted_at IS NULL
                          AND (
                              COALESCE(degrees.unique_opponents, 0) <= 3
                              OR pr.rating_deviation > 110
                              OR pr.rated_matches < 10
                          )
                        ORDER BY
                            COALESCE(degrees.unique_opponents, 0) ASC,
                            pr.rating_deviation DESC,
                            pr.rated_matches ASC,
                            ep.name ASC
                        LIMIT 12
                    `.execute(db),
                ]);

                const modelRow = modelResult.rows[0];
                if (!modelRow) {
                    return reply.status(404).send({
                        error: 'Rating model not found',
                        statusCode: 404,
                    });
                }

                const dataRow = dataResult.rows[0]!;
                const identityRow = identityResult.rows[0]!;
                const networkRow = networkResult.rows[0]!;
                const activeRubbers = Number(dataRow.active_rubbers);
                const eligibleSingles = Number(dataRow.eligible_singles);

                return reply.send({
                    model: {
                        key: modelRow.key,
                        status: modelRow.status,
                        last_processed_date: toDateString(modelRow.last_processed_date),
                        processed_periods: Number(modelRow.processed_periods ?? 0),
                        processed_matches: Number(modelRow.processed_matches ?? 0),
                        updated_at: modelRow.updated_at?.toISOString() ?? null,
                        rated_players: Number(modelRow.rated_players),
                        established_players: Number(modelRow.established_players),
                        provisional_players: Number(modelRow.provisional_players),
                        average_deviation: Number(modelRow.average_deviation ?? 0),
                        first_rated_date: toDateString(modelRow.first_rated_date),
                        last_rated_date: toDateString(modelRow.last_rated_date),
                    },
                    data: {
                        stored_rubbers: Number(dataRow.stored_rubbers),
                        active_rubbers: activeRubbers,
                        eligible_singles: eligibleSingles,
                        excluded_rubbers: Math.max(0, activeRubbers - eligibleSingles),
                        doubles: Number(dataRow.doubles),
                        non_normal_outcome: Number(dataRow.non_normal_outcome),
                        missing_date: Number(dataRow.missing_date),
                        missing_identity: Number(dataRow.missing_identity),
                        same_canonical_player: Number(dataRow.same_canonical_player),
                        tied_score: Number(dataRow.tied_score),
                    },
                    identities: {
                        source_records: Number(identityRow.source_records),
                        active_records: Number(identityRow.active_records),
                        canonical_players: Number(identityRow.canonical_players),
                        linked_aliases: Number(identityRow.linked_aliases),
                        active_aliases: Number(identityRow.active_aliases),
                        soft_deleted_aliases: Number(identityRow.soft_deleted_aliases),
                        unassigned_records: Number(identityRow.unassigned_records),
                        broken_targets: Number(identityRow.broken_targets),
                        chained_links: Number(identityRow.chained_links),
                        deleted_targets: Number(identityRow.deleted_targets),
                        same_name_candidate_groups: Number(identityRow.same_name_candidate_groups),
                        multi_source_players: Number(identityRow.multi_source_players),
                    },
                    network: {
                        eligible_matches: Number(networkRow.eligible_matches),
                        connected_players: Number(networkRow.connected_players),
                        unique_pairings: Number(networkRow.unique_pairings),
                        average_unique_opponents: Number(networkRow.average_unique_opponents ?? 0),
                        maximum_unique_opponents: Number(networkRow.maximum_unique_opponents ?? 0),
                        one_opponent_players: Number(networkRow.one_opponent_players),
                        three_or_fewer_opponent_players: Number(networkRow.three_or_fewer_opponent_players),
                        competitions: Number(networkRow.competitions),
                        first_match_date: toDateString(networkRow.first_match_date),
                        last_match_date: toDateString(networkRow.last_match_date),
                    },
                    network_anomalies: anomalyResult.rows.map((row) => ({
                        player_id: row.player_id,
                        player_name: row.player_name,
                        rating: Number(row.rating),
                        rating_deviation: Number(row.rating_deviation),
                        rated_matches: Number(row.rated_matches),
                        unique_opponents: Number(row.unique_opponents),
                        provisional: row.provisional,
                    })),
                });
            },
        );
    };
}
