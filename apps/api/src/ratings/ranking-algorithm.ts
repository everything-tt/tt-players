import {
    expectedScore as sharedExpectedScore,
    updateRating as sharedUpdateRating,
} from '../../../../packages/ranking/src/index.js';

export interface ExpectedScorePlayer {
    rating: number | string;
}

export interface ExpectedScoreOpponent extends ExpectedScorePlayer {
    rating_deviation: number | string;
}

export interface RatingProjectionPlayer extends ExpectedScoreOpponent {
    volatility: number | string;
}

export interface WinRatingProjection {
    projectedRating: number;
    ratingChange: number;
}

export function expectedScore(
    player: ExpectedScorePlayer,
    opponent: ExpectedScoreOpponent,
): number {
    return sharedExpectedScore(
        { rating: Number(player.rating) },
        {
            rating: Number(opponent.rating),
            deviation: Number(opponent.rating_deviation),
        },
    );
}

export function projectRatingAfterWin(
    player: RatingProjectionPlayer,
    opponent: ExpectedScoreOpponent,
): WinRatingProjection {
    const currentRating = Number(player.rating);
    const updated = sharedUpdateRating(
        {
            rating: currentRating,
            deviation: Number(player.rating_deviation),
            volatility: Number(player.volatility),
        },
        [{
            opponentRating: Number(opponent.rating),
            opponentDeviation: Number(opponent.rating_deviation),
            score: 1,
        }],
    );

    return {
        projectedRating: updated.rating,
        ratingChange: updated.rating - currentRating,
    };
}
