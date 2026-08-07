// Compatibility facade for existing worker imports. The algorithm source of truth
// lives in the standalone ranking package.
export {
    DEFAULT_GLICKO2_CONFIG,
    conservativeRating,
    defaultRatingState,
    inflateDeviationForInactivity,
    updateRating,
} from '../../../../libs/ranking/src/index.js';
export type {
    Glicko2Config,
    RatingObservation,
    RatingState,
    RatingUpdate,
} from '../../../../libs/ranking/src/index.js';
