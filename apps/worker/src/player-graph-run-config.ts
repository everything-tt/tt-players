export const DEFAULT_PLAYER_GRAPH_WINDOW_DAYS = 1095;
export const DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS = 730;

// The analysis core requires a finite positive half-life. This value makes
// exp(-ln(2) * age / halfLife) indistinguishable from 1.0 at the six-decimal
// precision used for edge weights, while preserving the existing core API.
export const PLAYER_GRAPH_NO_DECAY_EFFECTIVE_HALF_LIFE_DAYS = Number.MAX_SAFE_INTEGER;

export interface ResolvePlayerGraphDecayOptions {
    noDecay?: boolean;
    halfLifeDays?: number;
}

export interface PlayerGraphDecayConfig {
    mode: 'half_life' | 'none';
    halfLifeDays: number | null;
    effectiveHalfLifeDays: number;
}

export function resolvePlayerGraphDecay(
    options: ResolvePlayerGraphDecayOptions = {},
): PlayerGraphDecayConfig {
    if (options.noDecay && options.halfLifeDays !== undefined) {
        throw new Error('--no-decay cannot be combined with --half-life-days');
    }

    if (options.noDecay) {
        return {
            mode: 'none',
            halfLifeDays: null,
            effectiveHalfLifeDays: PLAYER_GRAPH_NO_DECAY_EFFECTIVE_HALF_LIFE_DAYS,
        };
    }

    const halfLifeDays = options.halfLifeDays ?? DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS;
    if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) {
        throw new Error('halfLifeDays must be greater than zero');
    }

    return {
        mode: 'half_life',
        halfLifeDays,
        effectiveHalfLifeDays: halfLifeDays,
    };
}
