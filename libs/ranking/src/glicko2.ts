export interface Glicko2Config {
    initialRating: number;
    initialDeviation: number;
    initialVolatility: number;
    tau: number;
    ratingScale: number;
    conservativeDeviationMultiplier: number;
    provisionalMatches: number;
    provisionalDeviation: number;
    inactivityPeriodDays: number;
}

export interface RatingState {
    rating: number;
    deviation: number;
    volatility: number;
}

export interface RatingObservation {
    opponentRating: number;
    opponentDeviation: number;
    score: 0 | 0.5 | 1;
}

export interface RatingUpdate extends RatingState {
    conservativeRating: number;
}

export const DEFAULT_GLICKO2_CONFIG: Glicko2Config = {
    initialRating: 1500,
    initialDeviation: 350,
    initialVolatility: 0.06,
    tau: 0.5,
    ratingScale: 173.7178,
    conservativeDeviationMultiplier: 2,
    provisionalMatches: 10,
    provisionalDeviation: 110,
    inactivityPeriodDays: 28,
};

const PI_SQUARED = Math.PI * Math.PI;
const CONVERGENCE_TOLERANCE = 0.000001;

export function defaultRatingState(config: Glicko2Config = DEFAULT_GLICKO2_CONFIG): RatingState {
    return {
        rating: config.initialRating,
        deviation: config.initialDeviation,
        volatility: config.initialVolatility,
    };
}

export function conservativeRating(
    state: RatingState,
    config: Glicko2Config = DEFAULT_GLICKO2_CONFIG,
): number {
    return state.rating - config.conservativeDeviationMultiplier * state.deviation;
}

/**
 * Applies uncertainty growth without requiring one update per inactive period.
 * Inactivity is converted to fractional rating periods and capped at the model's
 * initial deviation.
 */
export function inflateDeviationForInactivity(
    state: RatingState,
    inactiveDays: number,
    config: Glicko2Config = DEFAULT_GLICKO2_CONFIG,
): RatingState {
    if (inactiveDays <= 0) return state;

    const inactivityPeriodDays = Math.max(1, config.inactivityPeriodDays);
    const inactivePeriods = inactiveDays / inactivityPeriodDays;
    const phi = state.deviation / config.ratingScale;
    const initialPhi = config.initialDeviation / config.ratingScale;
    const inflatedPhi = Math.min(
        initialPhi,
        Math.sqrt(phi * phi + state.volatility * state.volatility * inactivePeriods),
    );

    return {
        ...state,
        deviation: inflatedPhi * config.ratingScale,
    };
}

export function updateRating(
    state: RatingState,
    observations: readonly RatingObservation[],
    config: Glicko2Config = DEFAULT_GLICKO2_CONFIG,
): RatingUpdate {
    if (observations.length === 0) {
        const inactive = inflateDeviationForInactivity(state, 1, config);
        return {
            ...inactive,
            conservativeRating: conservativeRating(inactive, config),
        };
    }

    const mu = (state.rating - config.initialRating) / config.ratingScale;
    const phi = state.deviation / config.ratingScale;

    let inverseVariance = 0;
    let outcomeDelta = 0;

    for (const observation of observations) {
        const opponentMu =
            (observation.opponentRating - config.initialRating) / config.ratingScale;
        const opponentPhi = observation.opponentDeviation / config.ratingScale;
        const g = 1 / Math.sqrt(1 + (3 * opponentPhi * opponentPhi) / PI_SQUARED);
        const expected = 1 / (1 + Math.exp(-g * (mu - opponentMu)));

        inverseVariance += g * g * expected * (1 - expected);
        outcomeDelta += g * (observation.score - expected);
    }

    const variance = 1 / inverseVariance;
    const delta = variance * outcomeDelta;
    const volatility = calculateVolatility(phi, state.volatility, delta, variance, config.tau);
    const preRatingPhi = Math.sqrt(phi * phi + volatility * volatility);
    const updatedPhi = 1 / Math.sqrt(1 / (preRatingPhi * preRatingPhi) + 1 / variance);
    const updatedMu = mu + updatedPhi * updatedPhi * outcomeDelta;

    const updated: RatingState = {
        rating: config.initialRating + config.ratingScale * updatedMu,
        deviation: config.ratingScale * updatedPhi,
        volatility,
    };

    return {
        ...updated,
        conservativeRating: conservativeRating(updated, config),
    };
}

function calculateVolatility(
    phi: number,
    volatility: number,
    delta: number,
    variance: number,
    tau: number,
): number {
    const alpha = Math.log(volatility * volatility);

    const f = (x: number): number => {
        const exponent = Math.exp(x);
        const numerator = exponent * (delta * delta - phi * phi - variance - exponent);
        const denominator = 2 * Math.pow(phi * phi + variance + exponent, 2);
        return numerator / denominator - (x - alpha) / (tau * tau);
    };

    let a = alpha;
    let b: number;

    if (delta * delta > phi * phi + variance) {
        b = Math.log(delta * delta - phi * phi - variance);
    } else {
        let k = 1;
        b = alpha - k * tau;
        while (f(b) < 0) {
            k += 1;
            b = alpha - k * tau;
        }
    }

    let fA = f(a);
    let fB = f(b);

    while (Math.abs(b - a) > CONVERGENCE_TOLERANCE) {
        const c = a + ((a - b) * fA) / (fB - fA);
        const fC = f(c);

        if (fC * fB <= 0) {
            a = b;
            fA = fB;
        } else {
            fA /= 2;
        }

        b = c;
        fB = fC;
    }

    return Math.exp(a / 2);
}
