import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import {
    DEFAULT_GLICKO2_CONFIG,
    conservativeRating,
    defaultRatingState,
    expectedScore,
    inflateDeviationForInactivity,
    updateRating,
    type Glicko2Config,
    type RatingObservation,
    type RatingState,
} from './glicko2.js';
import { DEFAULT_RATING_MODEL_KEY } from './domain.js';

interface ModelRow {
    id: string;
    config: unknown;
}

interface LatestDateRow {
    latest_date: string | Date | null;
}

interface MatchRow {
    rubber_id: string;
    match_date: string | Date;
    home_player_id: string;
    away_player_id: string;
    home_games_won: number | string;
    away_games_won: number | string;
}

interface PlayerNameRow {
    id: string;
    name: string;
}

interface StoredPlayerState {
    state: RatingState;
    ratedMatches: number;
    lastDate: string;
}

interface CalibrationBucketState {
    count: number;
    predictionTotal: number;
    outcomeTotal: number;
}

interface WindowState {
    windowYears: number;
    trainingStartDate: string;
    players: Map<string, StoredPlayerState>;
    evaluatedMatches: number;
    coldStartMatches: number;
    squaredErrorTotal: number;
    logLossTotal: number;
    favouriteCorrect: number;
    calibration: CalibrationBucketState[];
}

export interface RatingBacktestMatch {
    rubberId: string;
    homePlayerId: string;
    awayPlayerId: string;
    homeWon: boolean;
}

export interface RatingBacktestCalibrationBucket {
    lower_bound: number;
    upper_bound: number;
    count: number;
    average_prediction: number;
    observed_home_win_rate: number;
}

export interface RatingBacktestTopPlayer {
    player_id: string;
    player_name: string;
    rating: number;
    rating_deviation: number;
    conservative_rating: number;
    rated_matches: number;
    last_rated_date: string;
}

export interface RatingBacktestMetric {
    window_years: number;
    training_start_date: string;
    evaluated_matches: number;
    cold_start_matches: number;
    brier_score: number;
    log_loss: number;
    favourite_accuracy: number;
    calibration_error: number;
    calibration: RatingBacktestCalibrationBucket[];
    top_players: RatingBacktestTopPlayer[];
}

export interface RatingBacktestSnapshot {
    model: string;
    generated_at: string;
    evaluation_start_date: string;
    evaluation_end_date: string;
    evaluation_days: number;
    windows: number[];
    methodology: {
        chronological: true;
        same_day_updates_are_simultaneous: true;
        eligibility_source: 'rating_rubber_classification';
        notes: string[];
    };
    metrics: RatingBacktestMetric[];
}

export interface RunRatingBacktestOptions {
    modelKey?: string;
    windows?: number[];
    evaluationDays?: number;
    evaluationEndDate?: string;
    log?: (message: string) => void;
}

export class RatingWindowBacktester {
    private readonly windows: WindowState[];

    constructor(
        private readonly config: Glicko2Config,
        private readonly evaluationStartDate: string,
        private readonly evaluationEndDate: string,
        windowYears: number[],
    ) {
        this.windows = windowYears.map((years) => ({
            windowYears: years,
            trainingStartDate: subtractYears(evaluationEndDate, years),
            players: new Map(),
            evaluatedMatches: 0,
            coldStartMatches: 0,
            squaredErrorTotal: 0,
            logLossTotal: 0,
            favouriteCorrect: 0,
            calibration: Array.from({ length: 10 }, () => ({
                count: 0,
                predictionTotal: 0,
                outcomeTotal: 0,
            })),
        }));
    }

    get earliestTrainingStartDate(): string {
        return this.windows.reduce(
            (earliest, window) => window.trainingStartDate < earliest
                ? window.trainingStartDate
                : earliest,
            this.windows[0]?.trainingStartDate ?? this.evaluationStartDate,
        );
    }

    processDay(date: string, matches: readonly RatingBacktestMatch[]): void {
        for (const window of this.windows) {
            if (date < window.trainingStartDate || date > this.evaluationEndDate) continue;
            this.processWindowDay(window, date, matches);
        }
    }

    finish(playerNames: ReadonlyMap<string, string> = new Map()): RatingBacktestMetric[] {
        return this.windows.map((window) => {
            const evaluatedMatches = window.evaluatedMatches;
            const calibration = window.calibration.map((bucket, index) => ({
                lower_bound: index / 10,
                upper_bound: (index + 1) / 10,
                count: bucket.count,
                average_prediction: bucket.count === 0
                    ? 0
                    : bucket.predictionTotal / bucket.count,
                observed_home_win_rate: bucket.count === 0
                    ? 0
                    : bucket.outcomeTotal / bucket.count,
            }));
            const calibrationError = evaluatedMatches === 0
                ? 0
                : calibration.reduce(
                    (total, bucket) => total
                        + bucket.count
                        * Math.abs(bucket.average_prediction - bucket.observed_home_win_rate),
                    0,
                ) / evaluatedMatches;

            const topPlayers = Array.from(window.players.entries())
                .map(([playerId, stored]) => {
                    const inactiveDays = Math.max(
                        0,
                        daysBetween(stored.lastDate, this.evaluationEndDate),
                    );
                    const current = inflateDeviationForInactivity(
                        stored.state,
                        inactiveDays,
                        this.config,
                    );
                    return {
                        player_id: playerId,
                        player_name: playerNames.get(playerId) ?? playerId,
                        rating: current.rating,
                        rating_deviation: current.deviation,
                        conservative_rating: conservativeRating(current, this.config),
                        rated_matches: stored.ratedMatches,
                        last_rated_date: stored.lastDate,
                    };
                })
                .filter((player) => player.rated_matches >= this.config.provisionalMatches)
                .sort((left, right) =>
                    right.conservative_rating - left.conservative_rating
                    || right.rated_matches - left.rated_matches
                    || left.player_name.localeCompare(right.player_name),
                )
                .slice(0, 25);

            return {
                window_years: window.windowYears,
                training_start_date: window.trainingStartDate,
                evaluated_matches: evaluatedMatches,
                cold_start_matches: window.coldStartMatches,
                brier_score: evaluatedMatches === 0
                    ? 0
                    : window.squaredErrorTotal / evaluatedMatches,
                log_loss: evaluatedMatches === 0
                    ? 0
                    : window.logLossTotal / evaluatedMatches,
                favourite_accuracy: evaluatedMatches === 0
                    ? 0
                    : window.favouriteCorrect / evaluatedMatches,
                calibration_error: calibrationError,
                calibration,
                top_players: topPlayers,
            };
        });
    }

    private processWindowDay(
        window: WindowState,
        date: string,
        matches: readonly RatingBacktestMatch[],
    ): void {
        const playerIds = new Set<string>();
        for (const match of matches) {
            playerIds.add(match.homePlayerId);
            playerIds.add(match.awayPlayerId);
        }

        const periodStates = new Map<string, RatingState>();
        for (const playerId of playerIds) {
            const stored = window.players.get(playerId);
            if (!stored) {
                periodStates.set(playerId, defaultRatingState(this.config));
                continue;
            }
            const inactiveDays = Math.max(0, daysBetween(stored.lastDate, date) - 1);
            periodStates.set(
                playerId,
                inflateDeviationForInactivity(stored.state, inactiveDays, this.config),
            );
        }

        const shouldEvaluate = date >= this.evaluationStartDate;
        const observations = new Map<string, RatingObservation[]>();

        for (const match of matches) {
            const homeState = periodStates.get(match.homePlayerId)
                ?? defaultRatingState(this.config);
            const awayState = periodStates.get(match.awayPlayerId)
                ?? defaultRatingState(this.config);

            if (shouldEvaluate) {
                const probability = expectedScore(homeState, awayState, this.config);
                const outcome = match.homeWon ? 1 : 0;
                const clipped = Math.min(1 - 1e-12, Math.max(1e-12, probability));
                window.evaluatedMatches += 1;
                if (
                    !window.players.has(match.homePlayerId)
                    || !window.players.has(match.awayPlayerId)
                ) {
                    window.coldStartMatches += 1;
                }
                window.squaredErrorTotal += (probability - outcome) ** 2;
                window.logLossTotal += -(
                    outcome * Math.log(clipped)
                    + (1 - outcome) * Math.log(1 - clipped)
                );
                if ((probability >= 0.5) === match.homeWon) {
                    window.favouriteCorrect += 1;
                }
                const bucketIndex = Math.min(9, Math.floor(probability * 10));
                const bucket = window.calibration[bucketIndex]!;
                bucket.count += 1;
                bucket.predictionTotal += probability;
                bucket.outcomeTotal += outcome;
            }

            addObservation(
                observations,
                match.homePlayerId,
                awayState,
                match.homeWon ? 1 : 0,
            );
            addObservation(
                observations,
                match.awayPlayerId,
                homeState,
                match.homeWon ? 0 : 1,
            );
        }

        for (const playerId of playerIds) {
            const playerObservations = observations.get(playerId) ?? [];
            if (playerObservations.length === 0) continue;
            const stored = window.players.get(playerId);
            const updated = updateRating(
                periodStates.get(playerId) ?? defaultRatingState(this.config),
                playerObservations,
                this.config,
            );
            window.players.set(playerId, {
                state: updated,
                ratedMatches: (stored?.ratedMatches ?? 0) + playerObservations.length,
                lastDate: date,
            });
        }
    }
}

export async function runRatingBacktest(
    db: Kysely<Database>,
    options: RunRatingBacktestOptions = {},
): Promise<RatingBacktestSnapshot> {
    const modelKey = options.modelKey ?? DEFAULT_RATING_MODEL_KEY;
    const windows = normalizeWindows(options.windows ?? [2, 3, 5, 10]);
    const evaluationDays = Math.max(30, Math.min(730, Math.floor(options.evaluationDays ?? 180)));
    const log = options.log ?? (() => undefined);

    const modelResult = await sql<ModelRow>`
        SELECT id, config
        FROM rating_models
        WHERE key = ${modelKey}
        LIMIT 1
    `.execute(db);
    const model = modelResult.rows[0];
    if (!model) throw new Error(`Unknown rating model: ${modelKey}`);

    const latestResult = await sql<LatestDateRow>`
        SELECT MAX(effective_date) AS latest_date
        FROM rating_rubber_classification
        WHERE eligibility_reason = 'eligible'
          AND effective_date <= CURRENT_DATE
    `.execute(db);
    const latestAvailableDate = toDateString(latestResult.rows[0]?.latest_date ?? null);
    const evaluationEndDate = options.evaluationEndDate ?? latestAvailableDate;
    if (!evaluationEndDate) throw new Error('No eligible matches are available for backtesting');
    if (latestAvailableDate && evaluationEndDate > latestAvailableDate) {
        throw new Error(
            `Evaluation end ${evaluationEndDate} is after latest eligible date ${latestAvailableDate}`,
        );
    }
    const evaluationStartDate = addDays(evaluationEndDate, -(evaluationDays - 1));
    const config = parseConfig(model.config);
    const backtester = new RatingWindowBacktester(
        config,
        evaluationStartDate,
        evaluationEndDate,
        windows,
    );

    let monthStart = startOfMonth(backtester.earliestTrainingStartDate);
    const finalMonth = startOfMonth(evaluationEndDate);
    const playerIds = new Set<string>();

    while (monthStart <= finalMonth) {
        const nextMonth = addMonths(monthStart, 1);
        log(`backtest: loading ${monthStart.slice(0, 7)}`);
        const result = await sql<MatchRow>`
            WITH period_rubbers AS MATERIALIZED (
                SELECT rubber.id
                FROM rubbers rubber
                WHERE rubber.deleted_at IS NULL
                  AND rubber.played_at >= ${monthStart}::date
                  AND rubber.played_at < ${nextMonth}::date

                UNION ALL

                SELECT rubber.id
                FROM fixtures fixture
                JOIN rubbers rubber ON rubber.fixture_id = fixture.id
                WHERE fixture.deleted_at IS NULL
                  AND fixture.date_played >= ${monthStart}::date
                  AND fixture.date_played < ${nextMonth}::date
                  AND rubber.deleted_at IS NULL
                  AND rubber.played_at IS NULL
            )
            SELECT
                classification.rubber_id,
                classification.effective_date AS match_date,
                classification.home_canonical_player_id AS home_player_id,
                classification.away_canonical_player_id AS away_player_id,
                classification.home_games_won,
                classification.away_games_won
            FROM period_rubbers period
            JOIN rating_rubber_classification classification
              ON classification.rubber_id = period.id
            WHERE classification.eligibility_reason = 'eligible'
              AND classification.effective_date >= ${backtester.earliestTrainingStartDate}::date
              AND classification.effective_date <= ${evaluationEndDate}::date
            ORDER BY classification.effective_date, classification.rubber_id
        `.execute(db);

        let currentDate: string | null = null;
        let dayMatches: RatingBacktestMatch[] = [];
        const flushDay = () => {
            if (!currentDate || dayMatches.length === 0) return;
            backtester.processDay(currentDate, dayMatches);
            dayMatches = [];
        };

        for (const row of result.rows) {
            const matchDate = toDateString(row.match_date)!;
            if (currentDate !== null && matchDate !== currentDate) flushDay();
            currentDate = matchDate;
            playerIds.add(row.home_player_id);
            playerIds.add(row.away_player_id);
            dayMatches.push({
                rubberId: row.rubber_id,
                homePlayerId: row.home_player_id,
                awayPlayerId: row.away_player_id,
                homeWon: Number(row.home_games_won) > Number(row.away_games_won),
            });
        }
        flushDay();
        monthStart = nextMonth;
    }

    const nameRows = playerIds.size === 0
        ? []
        : (await sql<PlayerNameRow>`
            SELECT id, name
            FROM external_players
            WHERE id = ANY(${Array.from(playerIds)}::uuid[])
        `.execute(db)).rows;
    const playerNames = new Map(nameRows.map((row) => [row.id, row.name]));
    const generatedAt = new Date();
    const snapshot: RatingBacktestSnapshot = {
        model: modelKey,
        generated_at: generatedAt.toISOString(),
        evaluation_start_date: evaluationStartDate,
        evaluation_end_date: evaluationEndDate,
        evaluation_days: evaluationDays,
        windows,
        methodology: {
            chronological: true,
            same_day_updates_are_simultaneous: true,
            eligibility_source: 'rating_rubber_classification',
            notes: [
                'Every prediction uses only rating state available before that match date.',
                'Matches on the same date are predicted from the same pre-date state and applied simultaneously.',
                'Window comparisons vary the earliest retained result while keeping the evaluation period fixed.',
                'Lower Brier score, log loss and calibration error are better; higher favourite accuracy is better.',
            ],
        },
        metrics: backtester.finish(playerNames),
    };

    await sql`
        INSERT INTO source_quality_snapshots (
            key,
            content,
            generated_at,
            updated_at
        ) VALUES (
            ${`rating-backtest:${modelKey}`},
            ${JSON.stringify(snapshot)}::jsonb,
            ${generatedAt},
            now()
        )
        ON CONFLICT (key) DO UPDATE SET
            content = EXCLUDED.content,
            generated_at = EXCLUDED.generated_at,
            updated_at = now()
    `.execute(db);

    return snapshot;
}

function addObservation(
    observations: Map<string, RatingObservation[]>,
    playerId: string,
    opponent: RatingState,
    score: 0 | 1,
): void {
    const observation: RatingObservation = {
        opponentRating: opponent.rating,
        opponentDeviation: opponent.deviation,
        score,
    };
    const existing = observations.get(playerId);
    if (existing) existing.push(observation);
    else observations.set(playerId, [observation]);
}

function parseConfig(value: unknown): Glicko2Config {
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
        inactivityPeriodDays: Math.max(
            1,
            asNumber(raw['inactivityPeriodDays'], DEFAULT_GLICKO2_CONFIG.inactivityPeriodDays),
        ),
    };
}

function normalizeWindows(values: number[]): number[] {
    const windows = Array.from(new Set(
        values
            .map((value) => Math.floor(value))
            .filter((value) => value >= 1 && value <= 20),
    )).sort((left, right) => left - right);
    if (windows.length === 0) throw new Error('At least one history window is required');
    return windows;
}

function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}

function startOfMonth(value: string): string {
    return `${value.slice(0, 7)}-01`;
}

function addMonths(value: string, months: number): string {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCMonth(date.getUTCMonth() + months);
    return date.toISOString().slice(0, 10);
}

function subtractYears(value: string, years: number): string {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCFullYear(date.getUTCFullYear() - years);
    return date.toISOString().slice(0, 10);
}

function addDays(value: string, days: number): string {
    const date = new Date(`${value}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
    const fromMs = Date.parse(`${from}T00:00:00Z`);
    const toMs = Date.parse(`${to}T00:00:00Z`);
    return Math.max(0, Math.floor((toMs - fromMs) / 86_400_000));
}

function asNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
