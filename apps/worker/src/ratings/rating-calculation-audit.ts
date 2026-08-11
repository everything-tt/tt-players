import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@tt-players/db';
import type { Glicko2Config, RatingState } from './glicko2.js';
import { calculateRatingMatchEvidence } from './rating-audit-evidence.js';

interface FingerprintRow {
    source_data_cutoff: string | Date | null;
    input_hash: string;
}

interface ProcessingStateRow {
    last_processed_date: string | Date | null;
}

interface RunRow {
    id: string;
}

interface RankRow {
    player_id: string;
    public_rank: number | string;
}

interface OpponentCountRow {
    player_id: string;
    unique_opponents: number | string;
}

interface PeriodAuditIdRow {
    id: string;
    player_id: string;
}

const EXCLUDED_MATCH_AUDIT_BATCH_SIZE = 2_000;

export type RatingDataSource = 'classification-view' | 'rebuild-table';

export function ratingDataSourceTable(source: RatingDataSource = 'classification-view') {
    return sql.raw(
        source === 'rebuild-table'
            ? 'rating_rebuild_matches'
            : 'rating_rubber_classification',
    );
}

export interface RatingCalculationAuditRun {
    id: string;
    sourceDataCutoff: string | null;
    lastProcessedDate: string | null;
    inputHash: string;
}

export interface BeginRatingCalculationAuditOptions {
    modelId: string;
    modelKey: string;
    modelVersion: string;
    parameters: unknown;
    codeCommitSha?: string;
}

export interface RatingPeriodAuditPlayer {
    playerId: string;
    before: RatingState;
    beforeRankingScore: number;
    beforePublicRank: number | null;
    after: RatingState;
    afterRankingScore: number;
    afterPublicRank: number | null;
    ratedMatchesInPeriod: number;
    totalRatedMatches: number;
    uniqueOpponentCount: number;
    provisionalBefore: boolean;
    provisionalAfter: boolean;
}

export interface RatingAuditMatch {
    rubberId: string;
    homePlayerId: string;
    awayPlayerId: string;
    homeGamesWon: number;
    awayGamesWon: number;
}

export async function beginRatingCalculationAudit(
    db: Kysely<Database>,
    options: BeginRatingCalculationAuditOptions,
): Promise<RatingCalculationAuditRun> {
    const fingerprintResult = await sql<FingerprintRow>`
        SELECT
            MAX(effective_date) AS source_data_cutoff,
            md5(COALESCE(string_agg(
                concat_ws('|',
                    rubber_id,
                    COALESCE(effective_date::text, ''),
                    eligibility_reason,
                    is_doubles,
                    outcome_type,
                    COALESCE(home_player_1_id::text, ''),
                    COALESCE(away_player_1_id::text, ''),
                    COALESCE(home_canonical_player_id::text, ''),
                    COALESCE(away_canonical_player_id::text, ''),
                    home_games_won,
                    away_games_won
                ),
                E'\n' ORDER BY effective_date NULLS FIRST, rubber_id
            ), '')) AS input_hash
        FROM rating_rubber_classification
    `.execute(db);
    const fingerprint = fingerprintResult.rows[0] ?? {
        source_data_cutoff: null,
        input_hash: md5EmptyInput,
    };

    const stateResult = await sql<ProcessingStateRow>`
        SELECT last_processed_date
        FROM rating_processing_state
        WHERE model_id = ${options.modelId}::uuid
        LIMIT 1
    `.execute(db);
    const lastProcessedDate = toDateString(stateResult.rows[0]?.last_processed_date ?? null);
    const sourceDataCutoff = toDateString(fingerprint.source_data_cutoff);

    const runResult = await sql<RunRow>`
        INSERT INTO rating_calculation_runs (
            model_id,
            model_key,
            model_version,
            source_data_cutoff,
            code_commit_sha,
            algorithm_parameters,
            input_hash,
            run_status
        ) VALUES (
            ${options.modelId}::uuid,
            ${options.modelKey},
            ${options.modelVersion},
            ${sourceDataCutoff}::date,
            ${resolveRatingCodeCommitSha(options.codeCommitSha)},
            ${JSON.stringify(options.parameters)}::jsonb,
            ${fingerprint.input_hash},
            'running'
        )
        RETURNING id
    `.execute(db);
    const runId = runResult.rows[0]?.id;
    if (!runId) throw new Error('Failed to create rating calculation audit run');

    await recordExcludedMatches(
        db,
        runId,
        lastProcessedDate,
        sourceDataCutoff,
    );

    return {
        id: runId,
        sourceDataCutoff,
        lastProcessedDate,
        inputHash: fingerprint.input_hash,
    };
}

export async function finishRatingCalculationAudit(
    db: Kysely<Database>,
    runId: string,
    status: 'complete' | 'partial' | 'busy' | 'failed',
    processedPeriods: number,
    processedMatches: number,
    failureMessage: string | null = null,
): Promise<void> {
    await sql`
        UPDATE rating_calculation_runs
        SET run_status = ${status},
            completed_at = now(),
            processed_periods = ${processedPeriods},
            processed_matches = ${processedMatches},
            failure_message = ${failureMessage}
        WHERE id = ${runId}::uuid
    `.execute(db);
}

export async function loadRatingAuditPublicRanks(
    trx: Transaction<Database>,
    modelId: string,
    playerIds: string[],
): Promise<Map<string, number>> {
    if (playerIds.length === 0) return new Map();

    const result = await sql<RankRow>`
        WITH ranked AS (
            SELECT
                player_id,
                ROW_NUMBER() OVER (
                    ORDER BY conservative_rating DESC, rated_matches DESC, player_id
                )::int AS public_rank
            FROM player_ratings
            WHERE model_id = ${modelId}::uuid
        )
        SELECT player_id, public_rank
        FROM ranked
        WHERE player_id = ANY(${playerIds}::uuid[])
    `.execute(trx);

    return new Map(result.rows.map((row) => [row.player_id, Number(row.public_rank)]));
}

export async function loadUniqueOpponentCounts(
    trx: Transaction<Database>,
    playerIds: string[],
    throughDate: string,
    source: RatingDataSource = 'classification-view',
): Promise<Map<string, number>> {
    if (playerIds.length === 0) return new Map();

    const sourceTable = ratingDataSourceTable(source);
    const result = await sql<OpponentCountRow>`
        WITH observations AS (
            SELECT
                home_canonical_player_id AS player_id,
                away_canonical_player_id AS opponent_id
            FROM ${sourceTable}
            WHERE eligibility_reason = 'eligible'
              AND effective_date <= ${throughDate}::date
              AND home_canonical_player_id = ANY(${playerIds}::uuid[])

            UNION ALL

            SELECT
                away_canonical_player_id AS player_id,
                home_canonical_player_id AS opponent_id
            FROM ${sourceTable}
            WHERE eligibility_reason = 'eligible'
              AND effective_date <= ${throughDate}::date
              AND away_canonical_player_id = ANY(${playerIds}::uuid[])
        )
        SELECT
            player_id,
            COUNT(DISTINCT opponent_id)::int AS unique_opponents
        FROM observations
        GROUP BY player_id
    `.execute(trx);

    return new Map(result.rows.map((row) => [row.player_id, Number(row.unique_opponents)]));
}

export async function recordRatingPeriodAudit(
    trx: Transaction<Database>,
    options: {
        runId: string;
        modelId: string;
        ratingDate: string;
        players: RatingPeriodAuditPlayer[];
        matches: RatingAuditMatch[];
        config: Glicko2Config;
    },
): Promise<void> {
    if (options.players.length === 0) return;

    const periodRows = options.players.map((player) => ({
        player_id: player.playerId,
        rating_before: player.before.rating,
        rating_deviation_before: player.before.deviation,
        volatility_before: player.before.volatility,
        ranking_score_before: player.beforeRankingScore,
        public_rank_before: player.beforePublicRank,
        rating_after: player.after.rating,
        rating_deviation_after: player.after.deviation,
        volatility_after: player.after.volatility,
        ranking_score_after: player.afterRankingScore,
        public_rank_after: player.afterPublicRank,
        rated_matches_in_period: player.ratedMatchesInPeriod,
        total_rated_matches: player.totalRatedMatches,
        unique_opponent_count: player.uniqueOpponentCount,
        provisional_before: player.provisionalBefore,
        provisional_after: player.provisionalAfter,
        combined_rating_delta: player.after.rating - player.before.rating,
    }));

    const periodResult = await sql<PeriodAuditIdRow>`
        INSERT INTO rating_period_audits (
            run_id,
            model_id,
            rating_date,
            player_id,
            rating_before,
            rating_deviation_before,
            volatility_before,
            ranking_score_before,
            public_rank_before,
            rating_after,
            rating_deviation_after,
            volatility_after,
            ranking_score_after,
            public_rank_after,
            rated_matches_in_period,
            total_rated_matches,
            unique_opponent_count,
            provisional_before,
            provisional_after,
            combined_rating_delta
        )
        SELECT
            ${options.runId}::uuid,
            ${options.modelId}::uuid,
            ${options.ratingDate}::date,
            rows.player_id,
            rows.rating_before,
            rows.rating_deviation_before,
            rows.volatility_before,
            rows.ranking_score_before,
            rows.public_rank_before,
            rows.rating_after,
            rows.rating_deviation_after,
            rows.volatility_after,
            rows.ranking_score_after,
            rows.public_rank_after,
            rows.rated_matches_in_period,
            rows.total_rated_matches,
            rows.unique_opponent_count,
            rows.provisional_before,
            rows.provisional_after,
            rows.combined_rating_delta
        FROM jsonb_to_recordset(${JSON.stringify(periodRows)}::jsonb) AS rows(
            player_id uuid,
            rating_before double precision,
            rating_deviation_before double precision,
            volatility_before double precision,
            ranking_score_before double precision,
            public_rank_before integer,
            rating_after double precision,
            rating_deviation_after double precision,
            volatility_after double precision,
            ranking_score_after double precision,
            public_rank_after integer,
            rated_matches_in_period integer,
            total_rated_matches integer,
            unique_opponent_count integer,
            provisional_before boolean,
            provisional_after boolean,
            combined_rating_delta double precision
        )
        RETURNING id, player_id
    `.execute(trx);

    const periodIds = new Map(periodResult.rows.map((row) => [row.player_id, row.id]));
    const playerById = new Map(options.players.map((player) => [player.playerId, player]));
    const matchRows: Array<Record<string, unknown>> = [];

    for (const match of options.matches) {
        const home = playerById.get(match.homePlayerId);
        const away = playerById.get(match.awayPlayerId);
        if (!home || !away) continue;

        const homeWon = match.homeGamesWon > match.awayGamesWon;
        addIncludedMatchPerspective(
            matchRows,
            match,
            'home',
            home,
            away,
            homeWon ? 1 : 0,
            periodIds.get(home.playerId) ?? null,
            options.config,
        );
        addIncludedMatchPerspective(
            matchRows,
            match,
            'away',
            away,
            home,
            homeWon ? 0 : 1,
            periodIds.get(away.playerId) ?? null,
            options.config,
        );
    }

    if (matchRows.length === 0) return;

    await sql`
        INSERT INTO rating_match_audits (
            run_id,
            period_audit_id,
            rating_date,
            rubber_id,
            side,
            player_id,
            opponent_id,
            result,
            game_score,
            player_rating_before,
            player_rating_deviation_before,
            opponent_rating_before,
            opponent_rating_deviation_before,
            expected_win_probability,
            actual_score,
            surprise_value,
            attributed_rating_delta,
            information_contribution,
            included,
            exclusion_reason
        )
        SELECT
            ${options.runId}::uuid,
            rows.period_audit_id,
            ${options.ratingDate}::date,
            rows.rubber_id,
            rows.side,
            rows.player_id,
            rows.opponent_id,
            rows.result,
            rows.game_score,
            rows.player_rating_before,
            rows.player_rating_deviation_before,
            rows.opponent_rating_before,
            rows.opponent_rating_deviation_before,
            rows.expected_win_probability,
            rows.actual_score,
            rows.surprise_value,
            rows.attributed_rating_delta,
            rows.information_contribution,
            true,
            NULL
        FROM jsonb_to_recordset(${JSON.stringify(matchRows)}::jsonb) AS rows(
            period_audit_id uuid,
            rubber_id uuid,
            side varchar,
            player_id uuid,
            opponent_id uuid,
            result varchar,
            game_score varchar,
            player_rating_before double precision,
            player_rating_deviation_before double precision,
            opponent_rating_before double precision,
            opponent_rating_deviation_before double precision,
            expected_win_probability double precision,
            actual_score double precision,
            surprise_value double precision,
            attributed_rating_delta double precision,
            information_contribution double precision
        )
    `.execute(trx);
}

function addIncludedMatchPerspective(
    rows: Array<Record<string, unknown>>,
    match: RatingAuditMatch,
    side: 'home' | 'away',
    player: RatingPeriodAuditPlayer,
    opponent: RatingPeriodAuditPlayer,
    score: 0 | 1,
    periodAuditId: string | null,
    config: Glicko2Config,
): void {
    const evidence = calculateRatingMatchEvidence(
        player.before,
        opponent.before,
        score,
        player.after.deviation,
        config,
    );
    const homeSide = side === 'home';
    const playerGames = homeSide ? match.homeGamesWon : match.awayGamesWon;
    const opponentGames = homeSide ? match.awayGamesWon : match.homeGamesWon;

    rows.push({
        period_audit_id: periodAuditId,
        rubber_id: match.rubberId,
        side,
        player_id: player.playerId,
        opponent_id: opponent.playerId,
        result: score === 1 ? 'win' : 'loss',
        game_score: `${playerGames}-${opponentGames}`,
        player_rating_before: player.before.rating,
        player_rating_deviation_before: player.before.deviation,
        opponent_rating_before: opponent.before.rating,
        opponent_rating_deviation_before: opponent.before.deviation,
        expected_win_probability: evidence.expectedWinProbability,
        actual_score: score,
        surprise_value: evidence.surpriseValue,
        attributed_rating_delta: evidence.attributedRatingDelta,
        information_contribution: evidence.informationContribution,
    });
}

async function recordExcludedMatches(
    db: Kysely<Database>,
    runId: string,
    lastProcessedDate: string | null,
    sourceDataCutoff: string | null,
): Promise<void> {
    let lastRubberId: string | null = null;

    for (;;) {
        const inserted = await sql<{ rubber_id: string }>`
            WITH batch AS (
                SELECT classification.*
                FROM rating_rubber_classification classification
                WHERE classification.eligibility_reason <> 'eligible'
                  AND (
                      ${lastProcessedDate}::date IS NULL
                      OR classification.effective_date IS NULL
                      OR classification.effective_date > ${lastProcessedDate}::date
                  )
                  AND (
                      ${sourceDataCutoff}::date IS NULL
                      OR classification.effective_date IS NULL
                      OR classification.effective_date <= ${sourceDataCutoff}::date
                  )
                  AND (
                      ${lastRubberId}::uuid IS NULL
                      OR classification.rubber_id > ${lastRubberId}::uuid
                  )
                ORDER BY classification.rubber_id
                LIMIT ${EXCLUDED_MATCH_AUDIT_BATCH_SIZE}
            )
            INSERT INTO rating_match_audits (
                run_id,
                rating_date,
                rubber_id,
                side,
                player_id,
                opponent_id,
                game_score,
                included,
                exclusion_reason
            )
            SELECT
                ${runId}::uuid,
                batch.effective_date,
                batch.rubber_id,
                side_data.side,
                side_data.player_id,
                side_data.opponent_id,
                side_data.game_score,
                false,
                batch.eligibility_reason
            FROM batch
            CROSS JOIN LATERAL (
                VALUES
                    (
                        'home'::varchar,
                        batch.home_canonical_player_id,
                        batch.away_canonical_player_id,
                        concat(batch.home_games_won, '-', batch.away_games_won)
                    ),
                    (
                        'away'::varchar,
                        batch.away_canonical_player_id,
                        batch.home_canonical_player_id,
                        concat(batch.away_games_won, '-', batch.home_games_won)
                    )
            ) AS side_data(side, player_id, opponent_id, game_score)
            RETURNING rubber_id
        `.execute(db);

        if (inserted.rows.length === 0) break;

        for (const row of inserted.rows) {
            if (!lastRubberId || row.rubber_id > lastRubberId) {
                lastRubberId = row.rubber_id;
            }
        }

        if (inserted.rows.length < EXCLUDED_MATCH_AUDIT_BATCH_SIZE * 2) break;
    }
}

export function resolveRatingCodeCommitSha(explicit?: string): string {
    const candidate = explicit
        ?? process.env['TT_PLAYERS_COMMIT_SHA']
        ?? process.env['GITHUB_SHA']
        ?? process.env['COMMIT_SHA'];
    if (candidate?.trim()) return candidate.trim();

    try {
        const metadataPath = fileURLToPath(new URL('../../../../.release-metadata', import.meta.url));
        const metadata = readFileSync(metadataPath, 'utf8');
        const commitLine = metadata
            .split(/\r?\n/)
            .find((line) => line.startsWith('commit_sha='));
        const commitSha = commitLine?.slice('commit_sha='.length).trim();
        if (commitSha) return commitSha;
    } catch {
        // Local development and tests do not have deployment metadata.
    }

    return 'unknown';
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}

const md5EmptyInput = 'd41d8cd98f00b204e9800998ecf8427e';
