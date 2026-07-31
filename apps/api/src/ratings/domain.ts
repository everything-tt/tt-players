export const DEFAULT_RATING_MODEL_KEY = 'global-singles-glicko2-v1';

const GLICKO2_SCALE = 173.7178;

export type RatingConfidence = 'high' | 'medium' | 'low';

export interface RatingRow {
    player_id: string;
    player_name: string;
    rating: number | string;
    rating_deviation: number | string;
    conservative_rating: number | string;
    rated_matches: number | string;
    rated_wins: number | string;
    rated_losses: number | string;
    provisional: boolean;
    first_rated_at: string | Date | null;
    last_rated_at: string | Date | null;
    rank?: number | string | null;
    total?: number | string;
}

export interface RankedRatingRow extends RatingRow {
    rank: number | string;
}

export function presentRating(row: RatingRow, rank: number | null) {
    const rating = Number(row.rating);
    const deviation = Number(row.rating_deviation);
    const ratedMatches = Number(row.rated_matches);
    const ratedWins = Number(row.rated_wins);

    return {
        rank,
        player_id: row.player_id,
        player_name: row.player_name,
        rating,
        rating_deviation: deviation,
        conservative_rating: Number(row.conservative_rating),
        rating_low: round(rating - 2 * deviation, 2),
        rating_high: round(rating + 2 * deviation, 2),
        confidence: ratingConfidence(deviation),
        rated_matches: ratedMatches,
        rated_wins: ratedWins,
        rated_losses: Number(row.rated_losses),
        win_rate: ratedMatches > 0 ? ratedWins / ratedMatches : 0,
        provisional: row.provisional,
        first_rated_at: toDateString(row.first_rated_at),
        last_rated_at: toDateString(row.last_rated_at),
    };
}

export function presentRankedRating(row: RankedRatingRow) {
    return {
        ...presentRating(row, Number(row.rank)),
        rank: Number(row.rank),
    };
}

export function predictMatch(player1: RatingRow, player2: RatingRow) {
    const player1Expected = expectedScore(player1, player2);
    const player2Expected = expectedScore(player2, player1);
    const player1Probability = clampProbability((player1Expected + (1 - player2Expected)) / 2);
    const player2Probability = 1 - player1Probability;
    const combinedDeviation = Math.sqrt(
        Number(player1.rating_deviation) ** 2 + Number(player2.rating_deviation) ** 2,
    );

    return {
        confidence: predictionConfidence(player1, player2),
        combinedDeviation: round(combinedDeviation, 2),
        player1Probability,
        player2Probability,
    };
}

export function presentPredictionPlayer(row: RatingRow, probability: number) {
    return {
        player_id: row.player_id,
        player_name: row.player_name,
        rating: Number(row.rating),
        rating_deviation: Number(row.rating_deviation),
        provisional: row.provisional,
        win_probability: round(clampProbability(probability), 4),
    };
}

export function ratingConfidence(deviation: number): RatingConfidence {
    if (deviation <= 70) return 'high';
    if (deviation <= 120) return 'medium';
    return 'low';
}

export function round(value: number, decimalPlaces: number): number {
    const factor = 10 ** decimalPlaces;
    return Math.round(value * factor) / factor;
}

export function toDateString(value: string | Date | null): string | null {
    if (!value) return null;
    return value instanceof Date
        ? value.toISOString().slice(0, 10)
        : String(value).slice(0, 10);
}

function expectedScore(player: RatingRow, opponent: RatingRow): number {
    const playerMu = (Number(player.rating) - 1500) / GLICKO2_SCALE;
    const opponentMu = (Number(opponent.rating) - 1500) / GLICKO2_SCALE;
    const opponentPhi = Number(opponent.rating_deviation) / GLICKO2_SCALE;
    const g = 1 / Math.sqrt(1 + (3 * opponentPhi * opponentPhi) / (Math.PI * Math.PI));
    const exponent = Math.max(-35, Math.min(35, -g * (playerMu - opponentMu)));
    return 1 / (1 + Math.exp(exponent));
}

function predictionConfidence(player1: RatingRow, player2: RatingRow): RatingConfidence {
    if (player1.provisional || player2.provisional) return 'low';
    return ratingConfidence(
        Math.max(Number(player1.rating_deviation), Number(player2.rating_deviation)),
    );
}

function clampProbability(value: number): number {
    return Math.max(0, Math.min(1, value));
}
