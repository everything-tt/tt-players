import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { calculateRatingsWithReplay } from '../ratings/calculate-ratings-with-replay.js';

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
};
