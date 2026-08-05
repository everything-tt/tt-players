import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { DEFAULT_RATING_MODEL_KEY, toDateString } from './domain.js';

interface ModelHealthRow {
    model_id: string;
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
    anomalies: unknown;
}

export interface RatingAuditNetworkAnomaly {
    player_id: string;
    player_name: string;
    rating: number;
    rating_deviation: number;
    rated_matches: number;
    unique_opponents: number;
    provisional: boolean;
}

export interface RatingAuditSnapshotContent {
    model: {
        key: string;
        status: string | null;
        last_processed_date: string | null;
        processed_periods: number;
        processed_matches: number;
        updated_at: string | null;
        rated_players: number;
        established_players: number;
        provisional_players: number;
        average_deviation: number;
        first_rated_date: string | null;
        last_rated_date: string | null;
    };
    data: {
        stored_rubbers: number;
        active_rubbers: number;
        eligible_singles: number;
        excluded_rubbers: number;
        doubles: number;
        non_normal_outcome: number;
        missing_date: number;
        missing_identity: number;
        same_canonical_player: number;
        tied_score: number;
    };
    identities: {
        source_records: number;
        active_records: number;
        canonical_players: number;
        linked_aliases: number;
        active_aliases: number;
        soft_deleted_aliases: number;
        unassigned_records: number;
        broken_targets: number;
        chained_links: number;
        deleted_targets: number;
        same_name_candidate_groups: number;
        multi_source_players: number;
    };
    network: {
        eligible_matches: number;
        connected_players: number;
        unique_pairings: number;
        average_unique_opponents: number;
        maximum_unique_opponents: number;
        one_opponent_players: number;
        three_or_fewer_opponent_players: number;
        competitions: number;
        first_match_date: string | null;
        last_match_date: string | null;
    };
    network_anomalies: RatingAuditNetworkAnomaly[];
}

function numberValue(value: number | string | null | undefined): number {
    return Number(value ?? 0);
}

function normalizeAnomalies(value: unknown): RatingAuditNetworkAnomaly[] {
    if (!Array.isArray(value)) return [];

    return value.flatMap((candidate) => {
        if (!candidate || typeof candidate !== 'object') return [];
        const row = candidate as Record<string, unknown>;
        if (typeof row.player_id !== 'string' || typeof row.player_name !== 'string') return [];

        return [{
            player_id: row.player_id,
            player_name: row.player_name,
            rating: numberValue(row.rating as number | string | null | undefined),
            rating_deviation: numberValue(row.rating_deviation as number | string | null | undefined),
            rated_matches: numberValue(row.rated_matches as number | string | null | undefined),
            unique_opponents: numberValue(row.unique_opponents as number | string | null | undefined),
            provisional: row.provisional === true,
        }];
    });
}

export async function buildRatingAuditSnapshot(
    db: Kysely<Database>,
    modelKey = DEFAULT_RATING_MODEL_KEY,
): Promise<{ modelId: string; generatedAt: Date; content: RatingAuditSnapshotContent }> {
    const [modelResult, dataResult, identityResult, networkResult] = await Promise.all([
        sql<ModelHealthRow>`
            SELECT
                rm.id AS model_id,
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
            WHERE rm.key = ${modelKey}
            GROUP BY
                rm.id,
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
                COUNT(*) FILTER (
                    WHERE canonical_player_id IS NOT NULL
                      AND canonical_player_id <> id
                )::int AS linked_aliases,
                COUNT(*) FILTER (
                    WHERE canonical_player_id IS NOT NULL
                      AND canonical_player_id <> id
                      AND deleted_at IS NULL
                )::int AS active_aliases,
                COUNT(*) FILTER (
                    WHERE canonical_player_id IS NOT NULL
                      AND canonical_player_id <> id
                      AND deleted_at IS NOT NULL
                )::int AS soft_deleted_aliases,
                COUNT(*) FILTER (WHERE canonical_player_id IS NULL)::int AS unassigned_records,
                COUNT(*) FILTER (
                    WHERE canonical_player_id IS NOT NULL
                      AND target_id IS NULL
                )::int AS broken_targets,
                COUNT(*) FILTER (
                    WHERE canonical_player_id IS NOT NULL
                      AND canonical_player_id <> id
                      AND target_canonical_player_id IS NOT NULL
                      AND target_canonical_player_id <> target_id
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
            WITH eligible AS MATERIALIZED (
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
            directed_edges AS MATERIALIZED (
                SELECT home_player_id AS player_id, away_player_id AS opponent_id FROM eligible
                UNION
                SELECT away_player_id AS player_id, home_player_id AS opponent_id FROM eligible
            ),
            degrees AS MATERIALIZED (
                SELECT player_id, COUNT(*)::int AS unique_opponents
                FROM directed_edges
                GROUP BY player_id
            ),
            pairings AS MATERIALIZED (
                SELECT
                    LEAST(home_player_id, away_player_id) AS player_a,
                    GREATEST(home_player_id, away_player_id) AS player_b
                FROM eligible
                GROUP BY
                    LEAST(home_player_id, away_player_id),
                    GREATEST(home_player_id, away_player_id)
            ),
            anomaly_rows AS (
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
                WHERE rm.key = ${modelKey}
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
                LIMIT 20
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
                (SELECT MAX(match_date) FROM eligible) AS last_match_date,
                COALESCE(
                    (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'player_id', player_id,
                                'player_name', player_name,
                                'rating', rating,
                                'rating_deviation', rating_deviation,
                                'rated_matches', rated_matches,
                                'unique_opponents', unique_opponents,
                                'provisional', provisional
                            )
                            ORDER BY unique_opponents ASC, rating_deviation DESC, rated_matches ASC, player_name ASC
                        )
                        FROM anomaly_rows
                    ),
                    '[]'::jsonb
                ) AS anomalies
            FROM degrees
        `.execute(db),
    ]);

    const model = modelResult.rows[0];
    if (!model) throw new Error(`Unknown rating model: ${modelKey}`);

    const data = dataResult.rows[0];
    const identities = identityResult.rows[0];
    const network = networkResult.rows[0];
    const generatedAt = new Date();

    const dataHealth = {
        stored_rubbers: numberValue(data?.stored_rubbers),
        active_rubbers: numberValue(data?.active_rubbers),
        eligible_singles: numberValue(data?.eligible_singles),
        doubles: numberValue(data?.doubles),
        non_normal_outcome: numberValue(data?.non_normal_outcome),
        missing_date: numberValue(data?.missing_date),
        missing_identity: numberValue(data?.missing_identity),
        same_canonical_player: numberValue(data?.same_canonical_player),
        tied_score: numberValue(data?.tied_score),
    };

    return {
        modelId: model.model_id,
        generatedAt,
        content: {
            model: {
                key: model.key,
                status: model.status,
                last_processed_date: toDateString(model.last_processed_date),
                processed_periods: numberValue(model.processed_periods),
                processed_matches: numberValue(model.processed_matches),
                updated_at: model.updated_at?.toISOString() ?? null,
                rated_players: numberValue(model.rated_players),
                established_players: numberValue(model.established_players),
                provisional_players: numberValue(model.provisional_players),
                average_deviation: numberValue(model.average_deviation),
                first_rated_date: toDateString(model.first_rated_date),
                last_rated_date: toDateString(model.last_rated_date),
            },
            data: {
                ...dataHealth,
                excluded_rubbers: dataHealth.active_rubbers - dataHealth.eligible_singles,
            },
            identities: {
                source_records: numberValue(identities?.source_records),
                active_records: numberValue(identities?.active_records),
                canonical_players: numberValue(identities?.canonical_players),
                linked_aliases: numberValue(identities?.linked_aliases),
                active_aliases: numberValue(identities?.active_aliases),
                soft_deleted_aliases: numberValue(identities?.soft_deleted_aliases),
                unassigned_records: numberValue(identities?.unassigned_records),
                broken_targets: numberValue(identities?.broken_targets),
                chained_links: numberValue(identities?.chained_links),
                deleted_targets: numberValue(identities?.deleted_targets),
                same_name_candidate_groups: numberValue(identities?.same_name_candidate_groups),
                multi_source_players: numberValue(identities?.multi_source_players),
            },
            network: {
                eligible_matches: numberValue(network?.eligible_matches),
                connected_players: numberValue(network?.connected_players),
                unique_pairings: numberValue(network?.unique_pairings),
                average_unique_opponents: numberValue(network?.average_unique_opponents),
                maximum_unique_opponents: numberValue(network?.maximum_unique_opponents),
                one_opponent_players: numberValue(network?.one_opponent_players),
                three_or_fewer_opponent_players: numberValue(network?.three_or_fewer_opponent_players),
                competitions: numberValue(network?.competitions),
                first_match_date: toDateString(network?.first_match_date ?? null),
                last_match_date: toDateString(network?.last_match_date ?? null),
            },
            network_anomalies: normalizeAnomalies(network?.anomalies),
        },
    };
}

export async function refreshRatingAuditSnapshot(
    db: Kysely<Database>,
    modelKey = DEFAULT_RATING_MODEL_KEY,
): Promise<Date> {
    const snapshot = await buildRatingAuditSnapshot(db, modelKey);

    await sql`
        INSERT INTO rating_audit_snapshots (model_id, content, generated_at, updated_at)
        VALUES (
            ${snapshot.modelId}::uuid,
            ${JSON.stringify(snapshot.content)}::jsonb,
            ${snapshot.generatedAt},
            ${snapshot.generatedAt}
        )
        ON CONFLICT (model_id) DO UPDATE SET
            content = EXCLUDED.content,
            generated_at = EXCLUDED.generated_at,
            updated_at = EXCLUDED.updated_at
    `.execute(db);

    return snapshot.generatedAt;
}
