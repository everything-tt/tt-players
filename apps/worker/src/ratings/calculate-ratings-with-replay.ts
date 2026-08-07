import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import {
    calculateRatings,
    type CalculateRatingsOptions,
    type CalculateRatingsResult,
} from './calculate-ratings.js';
import { rewindDirtyRatingModel } from './rating-replay.js';

const DEFAULT_MODEL_KEY = 'global-singles-glicko2-v1';

export interface CalculateRatingsWithReplayResult extends CalculateRatingsResult {
    replayed: boolean;
    dirtyFromDate: string | null;
    checkpointDate: string | null;
    replayFromDate: string | null;
}

export async function calculateRatingsWithReplay(
    db: Kysely<Database>,
    options: CalculateRatingsOptions = {},
    log: (message: string) => void = () => undefined,
): Promise<CalculateRatingsWithReplayResult> {
    const modelKey = options.modelKey ?? DEFAULT_MODEL_KEY;

    if (!options.rebuild) {
        const replay = await rewindDirtyRatingModel(db, modelKey);
        if (replay.busy) {
            return {
                modelKey,
                processedPeriods: 0,
                processedMatches: 0,
                lastProcessedDate: replay.checkpointDate,
                complete: false,
                busy: true,
                auditRunId: null,
                replayed: false,
                dirtyFromDate: replay.dirtyFromDate,
                checkpointDate: replay.checkpointDate,
                replayFromDate: replay.replayFromDate,
            };
        }

        if (replay.replayed) {
            log(
                replay.checkpointDate
                    ? `ratings: replaying changes from ${replay.dirtyFromDate}; restored checkpoint ${replay.checkpointDate}`
                    : `ratings: replaying changes from ${replay.dirtyFromDate}; no earlier checkpoint, rebuilding model history`,
            );
        }

        const result = await calculateRatings(db, options, log);
        return {
            ...result,
            replayed: replay.replayed,
            dirtyFromDate: replay.dirtyFromDate,
            checkpointDate: replay.checkpointDate,
            replayFromDate: replay.replayFromDate,
        };
    }

    const result = await calculateRatings(db, options, log);
    return {
        ...result,
        replayed: false,
        dirtyFromDate: null,
        checkpointDate: null,
        replayFromDate: null,
    };
}
