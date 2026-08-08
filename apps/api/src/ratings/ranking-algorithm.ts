import {
    expectedScore as sharedExpectedScore,
} from '../../../../packages/ranking/src/index.js';

export interface ExpectedScorePlayer {
    rating: number | string;
}

export interface ExpectedScoreOpponent extends ExpectedScorePlayer {
    rating_deviation: number | string;
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
