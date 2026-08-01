import { describe, expect, it } from 'vitest';
import {
    chooseTournamentCandidate,
    type ReconciliationCandidate,
} from '../tournament-reconciliation.js';

const candidate = (
    id: string,
    overrides: Partial<ReconciliationCandidate> = {},
): ReconciliationCandidate => ({
    id,
    name: 'Liverpool Centenary Senior 4 Star Open',
    startDate: '2026-08-22',
    endDate: '2026-08-23',
    venue: 'Wavertree Tennis Centre Liverpool L15 4LE',
    category: '4* event, Senior',
    ...overrides,
});

describe('chooseTournamentCandidate', () => {
    const incoming = {
        name: 'Liverpool Centenary Senior 4* Open Results',
        startDate: '2026-08-22',
        endDate: null,
        venue: 'Wavertree Tennis Centre, Liverpool',
        category: 'Senior 4 Star',
    };

    it('automatically selects one clearly matching calendar tournament', () => {
        const result = chooseTournamentCandidate(incoming, [
            candidate('matching'),
            candidate('other', {
                name: 'Nottingham Junior 2 Star Open',
                startDate: '2026-08-22',
                endDate: '2026-08-22',
                venue: 'Nottingham',
                category: 'Junior 2*',
            }),
        ]);

        expect(result.decision).toBe('automatic');
        expect(result.candidate?.id).toBe('matching');
        expect(result.score?.total).toBeGreaterThanOrEqual(0.92);
    });

    it('requires review when the best candidate is plausible but uncertain', () => {
        const result = chooseTournamentCandidate(incoming, [
            candidate('possible', {
                name: 'Liverpool Senior Open',
                venue: 'Liverpool',
                category: 'Senior',
            }),
        ]);

        expect(result.decision).toBe('review');
        expect(result.candidate?.id).toBe('possible');
    });

    it('does not auto-match when two candidates are almost equally strong', () => {
        const result = chooseTournamentCandidate(incoming, [
            candidate('first'),
            candidate('second', { venue: 'Wavertree Sports Park Liverpool' }),
        ]);

        expect(result.decision).toBe('review');
        expect(result.reason).toBe('ambiguous');
    });

    it('returns no candidate for incompatible tournaments', () => {
        const result = chooseTournamentCandidate(incoming, [
            candidate('unrelated', {
                name: 'Bristol Cadet 1 Star',
                startDate: '2026-10-10',
                endDate: '2026-10-10',
                venue: 'Bristol',
                category: 'Cadet 1*',
            }),
        ]);

        expect(result).toEqual({
            decision: 'none',
            candidate: null,
            score: null,
            reason: 'below-threshold',
        });
    });
});
