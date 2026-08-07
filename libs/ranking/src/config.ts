import { DEFAULT_GLICKO2_CONFIG, type Glicko2Config } from './glicko2.js';

export function parseGlicko2Config(
    value: unknown,
    defaults: Glicko2Config = DEFAULT_GLICKO2_CONFIG,
): Glicko2Config {
    const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {};

    return {
        initialRating: asNumber(raw['initialRating'], defaults.initialRating),
        initialDeviation: asNumber(raw['initialDeviation'], defaults.initialDeviation),
        initialVolatility: asNumber(raw['initialVolatility'], defaults.initialVolatility),
        tau: asNumber(raw['tau'], defaults.tau),
        ratingScale: asNumber(raw['ratingScale'], defaults.ratingScale),
        conservativeDeviationMultiplier: asNumber(
            raw['conservativeDeviationMultiplier'],
            defaults.conservativeDeviationMultiplier,
        ),
        provisionalMatches: Math.max(
            0,
            Math.floor(asNumber(raw['provisionalMatches'], defaults.provisionalMatches)),
        ),
        provisionalDeviation: Math.max(
            0,
            asNumber(raw['provisionalDeviation'], defaults.provisionalDeviation),
        ),
        inactivityPeriodDays: Math.max(
            1,
            asNumber(raw['inactivityPeriodDays'], defaults.inactivityPeriodDays),
        ),
    };
}

export function isProvisionalRating(
    ratedMatches: number,
    deviation: number,
    config: Glicko2Config = DEFAULT_GLICKO2_CONFIG,
): boolean {
    return ratedMatches < config.provisionalMatches || deviation > config.provisionalDeviation;
}

function asNumber(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}
