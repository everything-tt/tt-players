import { db } from '@tt-players/db';
import { calculateRatings } from '../ratings/calculate-ratings.js';

interface CalculateRatingsPayload {
    modelKey?: string;
    maxPeriods?: number;
    rebuild?: boolean;
}

export async function calculateRatingsTask(
    payload: CalculateRatingsPayload,
    helpers: { logger: { info: (message: string) => void } },
): Promise<void> {
    const result = await calculateRatings(
        db,
        {
            modelKey: payload?.modelKey,
            maxPeriods: payload?.maxPeriods,
            rebuild: payload?.rebuild === true,
        },
        (message) => helpers.logger.info(message),
    );

    helpers.logger.info(
        `ratings: processed ${result.processedPeriods} periods and ${result.processedMatches} matches`
        + ` (complete=${result.complete}, busy=${result.busy})`,
    );
}
