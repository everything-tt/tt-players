import { sql, type Kysely, type Transaction } from 'kysely';
import type { Database } from '@tt-players/db';
import {
    DEFAULT_GLICKO2_CONFIG,
    defaultRatingState,
    inflateDeviationForInactivity,
    updateRating,
    type Glicko2Config,
    type RatingObservation,
    type RatingState,
} from './glicko2.js';

const DEFAULT_MODEL_KEY = 'global-singles-glicko2-v1';
const LOCK_KEY = 'tt-players:calculated-ratings';

interface StoredModel {
    id: string;
    key: string;
    config: unknown;
}

interface StoredState {
    player_id: string;
    rating: number;
    rating_deviation: number;
    volatility: number;
    rated_matches: number;
    rated_wins: number;
    rated_losses: number;
    first_rated_at: string | Date | null;
    last_rated_at: string | Date | null;
}

interface MatchRow {
    rubber_id: string;
    home_player_id: string;
    away_player_id: string;
    home_games_won: number;
    away_games_won: number;
}

interface ProcessingStateRow {
    last_processed_date: string | Date | null;
}

interface NextDateRow {
    next_date: string | Date | null;
}

interface CalculationConfig extends Glicko2Config {
    batchSize: number;
}

interface PendingPlayerUpdate {
    player_id: string;
    rating: number;
    rating_deviation: number;
    volatility: number;
    conservative_rating: number;
    rated_matches: number;
    rated_wins: number;
    rated_losses: number;
    first_rated_at: string;
    last_rated_at: string;
    provisional: boolean;
}

export interface CalculateRatingsOptions {
    modelKey?: string;
    maxPeriods?: number;
    rebuild?: boolean;
}

export interface CalculateRatingsResult {
    modelKey: string;
    processedPeriods: number;
    processedMatches: number;
    lastProcessedDate: string | null;
    complete: boolean;
    busy: boolean;
}

export async function calculateRatings(
    db: Kysely<Database>,
    options: CalculateRatingsOptions = {},
    log: (message: string) => void = () => undefined,
): Promise<CalculateRatingsResult> {
    const modelKey = options.modelKey ?? DEFAULT_MODEL_KEY;
    const maxPeriods = Math.max(1, Math.floor(options.maxPeriods ?? 31));

    if (options.rebuild) {
        const reset = await resetModel(db, modelKey);
        if (!reset) {
            return {
                modelKey,
                processedPeriods: 0,
                processedMatches: 0,
                lastProcessedDate: null,
                complete: false,
                busy: true,
            };
        }
        log(`ratings: reset ${modelKey}`);
    }

    let processedPeriods = 0;
    let processedMatches = 0;
    let lastProcessedDate: string | null = null;

    while (processedPeriods < maxPeriods) {
        const period = await processNextPeriod(db, modelKey);

        if (period.kind === 'busy') {
            return {
                modelKey,
                processedPeriods,
                processedMatches,
                lastProcessedDate,
                complete: false,
                busy: true,
            };
        }

        if (period.kind === 'complete') {
            return {
                modelKey,
                processedPeriods,
                processedMatches,
                lastProcessedDate: period.lastProcessedDate ?? lastProcessedDate,
                complete: true,
                busy: false,
            };
        }

        processedPeriods += 1;
        processedMatches += period.matches;
        lastProcessedDate = period.date;
        log(
            `ratings: ${period.date} — ${period.matches} matches, ${period.players} players`,
        );
    }

    return {
        modelKey,
        processedPeriods,
        processedMatches,
        lastProcessedDate,
        complete: false,
        busy: false,
    };
}

async function resetModel(db: Kysely<Database>, modelKey: string): Promise<boolean> {
    return db.transaction().execute(async (trx) => {
        if (!(await acquireLock(trx))) return false;

        const model = await loadModel(trx, modelKey);
        await sql`DELETE FROM player_ratings WHERE model_id = ${model.id}::uuid`.execute(trx);
        await sql`
            INSERT INTO rating_processing_state (
                model_id,
                last_processed_date,
                status,
                processed_periods,
                processed_matches,
                last_error,
                started_at,
                finished_at,
                updated_at
            ) VALUES (
                ${model.id}::uuid,
                NULL,
                'running',
                0,
                0,
                NULL,
                now(),
                NULL,
                now()
            )
            ON CONFLICT (model_id) DO UPDATE SET
                last_processed_date = NULL,
                status = 'running',
                processed_periods = 0,
                processed_matches = 0,
                last_error = NULL,
                started_at = now(),
                finished_at = NULL,
                updated_at = now()
        `.execute(trx);

        return true;
    });
}

async function processNextPeriod(
    db: Kysely<Database>,
    modelKey: string,
): Promise<
    | { kind: 'busy' }
    | { kind: 'complete'; lastProcessedDate: string | null }
    | { kind: 'processed'; date: string; matches: number; players: number }
> {
    return db.transaction().execute(async (trx) => {
        if (!(await acquireLock(trx))) return { kind: 'busy' as const };

        const model = await loadModel(trx, modelKey);
        const config = parseConfig(model.config);

        await sql`
            INSERT INTO rating_processing_state (model_id, status, started_at)
            VALUES (${model.id}::uuid, 'running', now())
            ON CONFLICT (model_id) DO NOTHING
        `.execute(trx);

        const stateResult = await sql<ProcessingStateRow>`
            SELECT last_processed_date
            FROM rating_processing_state
            WHERE model_id = ${model.id}::uuid
            FOR UPDATE
        `.execute(trx);
        const lastProcessedDate = toDateString(
            stateResult.rows[0]?.last_processed_date ?? null,
        );

        const nextDateResult = await sql<NextDateRow>`
            SELECT MIN(COALESCE(r.played_at::date, f.date_played)) AS next_date
            FROM rubbers r
            JOIN fixtures f ON f.id = r.fixture_id
            WHERE r.deleted_at IS NULL
              AND f.deleted_at IS NULL
              AND r.is_doubles = false
              AND r.outcome_type = 'normal'
              AND r.home_player_1_id IS NOT NULL
              AND r.away_player_1_id IS NOT NULL
              AND r.home_games_won <> r.away_games_won
              AND COALESCE(r.played_at::date, f.date_played) IS NOT NULL
              AND COALESCE(r.played_at::date, f.date_played)
                    > COALESCE(${lastProcessedDate}::date, '-infinity'::date)
        `.execute(trx);
        const nextDate = toDateString(nextDateResult.rows[0]?.next_date ?? null);

        if (!nextDate) {
            await sql`
                UPDATE rating_processing_state
                SET status = 'complete',
                    last_error = NULL,
                    finished_at = now(),
                    updated_at = now()
                WHERE model_id = ${model.id}::uuid
            `.execute(trx);
            return { kind: 'complete' as const, lastProcessedDate };
        }

        const matchResult = await sql<MatchRow>`
            SELECT
                r.id AS rubber_id,
                COALESCE(home_player.canonical_player_id, home_player.id) AS home_player_id,
                COALESCE(away_player.canonical_player_id, away_player.id) AS away_player_id,
                r.home_games_won,
                r.away_games_won
            FROM rubbers r
            JOIN fixtures f ON f.id = r.fixture_id
            JOIN external_players home_player ON home_player.id = r.home_player_1_id
            JOIN external_players away_player ON away_player.id = r.away_player_1_id
            WHERE r.deleted_at IS NULL
              AND f.deleted_at IS NULL
              AND r.is_doubles = false
              AND r.outcome_type = 'normal'
              AND r.home_games_won <> r.away_games_won
              AND COALESCE(r.played_at::date, f.date_played) = ${nextDate}::date
              AND COALESCE(home_player.canonical_player_id, home_player.id)
                    <> COALESCE(away_player.canonical_player_id, away_player.id)
            ORDER BY r.id
        `.execute(trx);

        const observations = new Map<string, Array<{ opponentId: string; score: 0 | 1 }>>();
        const wins = new Map<string, number>();

        for (const match of matchResult.rows) {
            const homeWon = Number(match.home_games_won) > Number(match.away_games_won);
            addObservation(observations, match.home_player_id, match.away_player_id, homeWon ? 1 : 0);
            addObservation(observations, match.away_player_id, match.home_player_id, homeWon ? 0 : 1);
            const winnerId = homeWon ? match.home_player_id : match.away_player_id;
            wins.set(winnerId, (wins.get(winnerId) ?? 0) + 1);
        }

        const playerIds = Array.from(observations.keys());
        const storedResult = playerIds.length === 0
            ? { rows: [] as StoredState[] }
            : await sql<StoredState>`
                SELECT
                    player_id,
                    rating,
                    rating_deviation,
                    volatility,
                    rated_matches,
                    rated_wins,
                    rated_losses,
                    first_rated_at,
                    last_rated_at
                FROM player_ratings
                WHERE model_id = ${model.id}::uuid
                  AND player_id = ANY(${playerIds}::uuid[])
            `.execute(trx);

        const storedByPlayer = new Map(storedResult.rows.map((row) => [row.player_id, row]));
        const periodStates = new Map<string, RatingState>();

        for (const playerId of playerIds) {
            const stored = storedByPlayer.get(playerId);
            const baseState = stored
                ? {
                    rating: Number(stored.rating),
                    deviation: Number(stored.rating_deviation),
                    volatility: Number(stored.volatility),
                }
                : defaultRatingState(config);
            const inactiveDays = stored?.last_rated_at
                ? Math.max(0, daysBetween(toDateString(stored.last_rated_at)!, nextDate) - 1)
                : 0;
            periodStates.set(
                playerId,
                inflateDeviationForInactivity(baseState, inactiveDays, config),
            );
        }

        const updates: PendingPlayerUpdate[] = [];
        for (const playerId of playerIds) {
            const playerObservations = observations.get(playerId) ?? [];
            const ratingObservations: RatingObservation[] = playerObservations.map((observation) => {
                const opponent = periodStates.get(observation.opponentId)
                    ?? defaultRatingState(config);
                return {
                    opponentRating: opponent.rating,
                    opponentDeviation: opponent.deviation,
                    score: observation.score,
                };
            });
            const updated = updateRating(
                periodStates.get(playerId) ?? defaultRatingState(config),
                ratingObservations,
                config,
            );
            const stored = storedByPlayer.get(playerId);
            const dayMatches = playerObservations.length;
            const dayWins = wins.get(playerId) ?? 0;
            const ratedMatches = Number(stored?.rated_matches ?? 0) + dayMatches;
            const ratedWins = Number(stored?.rated_wins ?? 0) + dayWins;
            const ratedLosses = Number(stored?.rated_losses ?? 0) + (dayMatches - dayWins);

            updates.push({
                player_id: playerId,
                rating: updated.rating,
                rating_deviation: updated.deviation,
                volatility: updated.volatility,
                conservative_rating: updated.conservativeRating,
                rated_matches: ratedMatches,
                rated_wins: ratedWins,
                rated_losses: ratedLosses,
                first_rated_at: toDateString(stored?.first_rated_at ?? null) ?? nextDate,
                last_rated_at: nextDate,
                provisional:
                    ratedMatches < config.provisionalMatches
                    || updated.deviation > config.provisionalDeviation,
            });
        }

        for (let offset = 0; offset < updates.length; offset += config.batchSize) {
            await upsertBatch(trx, model.id, updates.slice(offset, offset + config.batchSize));
        }

        await sql`
            UPDATE rating_processing_state
            SET last_processed_date = ${nextDate}::date,
                status = 'running',
                processed_periods = processed_periods + 1,
                processed_matches = processed_matches + ${matchResult.rows.length},
                last_error = NULL,
                finished_at = NULL,
                updated_at = now()
            WHERE model_id = ${model.id}::uuid
        `.execute(trx);

        return {
            kind: 'processed' as const,
            date: nextDate,
            matches: matchResult.rows.length,
            players: playerIds.length,
        };
    });
}

async function acquireLock(trx: Transaction<Database>): Promise<boolean> {
    const result = await sql<{ locked: boolean }>`
        SELECT pg_try_advisory_xact_lock(hashtext(${LOCK_KEY})) AS locked
    `.execute(trx);
    return result.rows[0]?.locked === true;
}

async function loadModel(
    trx: Transaction<Database>,
    modelKey: string,
): Promise<StoredModel> {
    const result = await sql<StoredModel>`
        SELECT id, key, config
        FROM rating_models
        WHERE key = ${modelKey}
        LIMIT 1
    `.execute(trx);
    const model = result.rows[0];
    if (!model) throw new Error(`Unknown rating model: ${modelKey}`);
    return model;
}

async function upsertBatch(
    trx: Transaction<Database>,
    modelId: string,
    updates: PendingPlayerUpdate[],
): Promise<void> {
    if (updates.length === 0) return;

    await sql`
        INSERT INTO player_ratings (
            model_id,
            player_id,
            rating,
            rating_deviation,
            volatility,
            conservative_rating,
            rated_matches,
            rated_wins,
            rated_losses,
            first_rated_at,
            last_rated_at,
            provisional,
            updated_at
        )
        SELECT
            ${modelId}::uuid,
            rows.player_id,
            rows.rating,
            rows.rating_deviation,
            rows.volatility,
            rows.conservative_rating,
            rows.rated_matches,
            rows.rated_wins,
            rows.rated_losses,
            rows.first_rated_at,
            rows.last_rated_at,
            rows.provisional,
            now()
        FROM jsonb_to_recordset(${JSON.stringify(updates)}::jsonb) AS rows(
            player_id uuid,
            rating double precision,
            rating_deviation double precision,
            volatility double precision,
            conservative_rating double precision,
            rated_matches integer,
            rated_wins integer,
            rated_losses integer,
            first_rated_at date,
            last_rated_at date,
            provisional boolean
        )
        ON CONFLICT (model_id, player_id) DO UPDATE SET
            rating = EXCLUDED.rating,
            rating_deviation = EXCLUDED.rating_deviation,
            volatility = EXCLUDED.volatility,
            conservative_rating = EXCLUDED.conservative_rating,
            rated_matches = EXCLUDED.rated_matches,
            rated_wins = EXCLUDED.rated_wins,
            rated_losses = EXCLUDED.rated_losses,
            first_rated_at = COALESCE(player_ratings.first_rated_at, EXCLUDED.first_rated_at),
            last_rated_at = EXCLUDED.last_rated_at,
            provisional = EXCLUDED.provisional,
            updated_at = now()
    `.execute(trx);
}

function parseConfig(value: unknown): CalculationConfig {
    const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};
    return {
        ...DEFAULT_GLICKO2_CONFIG,
        initialRating: asNumber(raw['initialRating'], DEFAULT_GLICKO2_CONFIG.initialRating),
        initialDeviation: asNumber(raw['initialDeviation'], DEFAULT_GLICKO2_CONFIG.initialDeviation),
        initialVolatility: asNumber(raw['initialVolatility'], DEFAULT_GLICKO2_CONFIG.initialVolatility),
        tau: asNumber(raw['tau'], DEFAULT_GLICKO2_CONFIG.tau),
        ratingScale: asNumber(raw['ratingScale'], DEFAULT_GLICKO2_CONFIG.ratingScale),
        conservativeDeviationMultiplier: asNumber(
            raw['conservativeDeviationMultiplier'],
            DEFAULT_GLICKO2_CONFIG.conservativeDeviationMultiplier,
        ),
        provisionalMatches: asNumber(
            raw['provisionalMatches'],
            DEFAULT_GLICKO2_CONFIG.provisionalMatches,
        ),
        provisionalDeviation: asNumber(
            raw['provisionalDeviation'],
            DEFAULT_GLICKO2_CONFIG.provisionalDeviation,
        ),
        batchSize: Math.max(25, Math.floor(asNumber(raw['batchSize'], 250))),
    };
}

function addObservation(
    observations: Map<string, Array<{ opponentId: string; score: 0 | 1 }>>,
    playerId: string,
    opponentId: string,
    score: 0 | 1,
): void {
    const existing = observations.get(playerId);
    if (existing) existing.push({ opponentId, score });
    else observations.set(playerId, [{ opponentId, score }]);
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}

function daysBetween(from: string, to: string): number {
    const fromMs = Date.parse(`${from}T00:00:00Z`);
    const toMs = Date.parse(`${to}T00:00:00Z`);
    return Math.max(0, Math.floor((toMs - fromMs) / 86_400_000));
}

function asNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
