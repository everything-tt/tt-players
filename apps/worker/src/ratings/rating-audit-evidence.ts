// Compatibility facade for existing worker audit imports. The deterministic
// evidence calculation lives in the standalone ranking package.
export {
    calculateRatingMatchEvidence,
} from '../../../../libs/ranking/src/index.js';
export type {
    RatingMatchEvidence,
} from '../../../../libs/ranking/src/index.js';
