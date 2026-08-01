import {
    scoreTournamentMatch,
    type TournamentMatchDecision,
    type TournamentMatchInput,
    type TournamentMatchScore,
} from './tournament-normalization.js';

export interface ReconciliationCandidate extends TournamentMatchInput {
    id: string;
}

export interface TournamentCandidateChoice {
    decision: TournamentMatchDecision;
    candidate: ReconciliationCandidate | null;
    score: TournamentMatchScore | null;
    reason: 'matched' | 'review-threshold' | 'ambiguous' | 'below-threshold';
}

const AMBIGUITY_MARGIN = 0.05;

export function chooseTournamentCandidate(
    incoming: TournamentMatchInput,
    candidates: ReconciliationCandidate[],
): TournamentCandidateChoice {
    const ranked = candidates
        .map((candidate) => ({
            candidate,
            score: scoreTournamentMatch(incoming, candidate),
        }))
        .sort((left, right) => right.score.total - left.score.total);

    const best = ranked[0];
    if (!best || best.score.decision === 'none') {
        return {
            decision: 'none',
            candidate: null,
            score: null,
            reason: 'below-threshold',
        };
    }

    const second = ranked[1];
    const ambiguous = Boolean(
        second
        && second.score.total >= 0.7
        && best.score.total - second.score.total < AMBIGUITY_MARGIN,
    );

    if (ambiguous) {
        return {
            decision: 'review',
            candidate: best.candidate,
            score: best.score,
            reason: 'ambiguous',
        };
    }

    if (best.score.decision === 'automatic') {
        return {
            decision: 'automatic',
            candidate: best.candidate,
            score: best.score,
            reason: 'matched',
        };
    }

    return {
        decision: 'review',
        candidate: best.candidate,
        score: best.score,
        reason: 'review-threshold',
    };
}
