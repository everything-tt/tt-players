import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { calculateRatingsWithReplay } from '../ratings/calculate-ratings-with-replay.js';
import { refreshCurrentRankings } from '../ratings/current-rankings.js';

interface CalculateRatingsPayload {
    modelKey?: string;
    maxPeriods?: number;
    rebuild?: boolean;
}

export const calculateRatingsTask: Task = async (payload, helpers): Promise<void> => {
    const options = payload as CalculateRatingsPayload | null | undefined;
    const result = await calculateRatingsWithReplay(
        db,
        {
            modelKey: options?.modelKey,
            maxPeriods: options?.maxPeriods,
            rebuild: options?.rebuild === true,
        },
        (message) => helpers.logger.info(message),
    );

    helpers.logger.info(
        `ratings: processed ${result.processedPeriods} periods and ${result.processedMatches} matches`
        + ` (complete=${result.complete}, busy=${result.busy}, replayed=${result.replayed})`,
    );

    if (!result.busy) {
        const ranking = await refreshCurrentRankings(db, result.modelKey);
        helpers.logger.info(
            `ratings: current ranking refreshed for ${ranking.rankedPlayers}/${ranking.totalPlayers} players`,
        );
    }
};
