import { describe, expect, it } from 'vitest';
import {
    normalizeTournamentName,
    normalizeVenue,
    scoreTournamentMatch,
} from '../tournament-normalization.js';

describe('normalizeTournamentName', () => {
    it('normalizes star notation, years, punctuation, and result suffixes', () => {
        expect(normalizeTournamentName('2026 Nottingham Senior 2-Star Results')).toBe(
            'nottingham senior 2 star',
        );
        expect(normalizeTournamentName('Nottingham Senior 2*')).toBe(
            'nottingham senior 2 star',
        );
    });

    it('normalizes common age-group forms', () => {
        expect(normalizeTournamentName('Under 15 National Championships')).toBe(
            'u15 national championship',
        );
        expect(normalizeTournamentName('U15 National Championship')).toBe(
            'u15 national championship',
        );
    });
});

describe('normalizeVenue', () => {
    it('normalizes punctuation and whitespace without discarding location words', () => {
        expect(normalizeVenue('  David Ross Sports Village, Nottingham  ')).toBe(
            'david ross sports village nottingham',
        );
    });
});

describe('scoreTournamentMatch', () => {
    it('gives equivalent event names on the same date a high-confidence score', () => {
        const score = scoreTournamentMatch(
            {
                name: '2026 Nottingham Senior 2-Star Tournament',
                startDate: '2026-10-10',
                endDate: '2026-10-11',
                venue: 'David Ross Sports Village, Nottingham',
                category: 'Senior 2 Star',
            },
            {
                name: 'Nottingham Senior 2* Results',
                startDate: '2026-10-10',
                venue: 'David Ross Sports Village Nottingham',
                category: 'Senior 2*',
            },
        );

        expect(score.total).toBeGreaterThanOrEqual(0.92);
        expect(score.decision).toBe('automatic');
    });

    it('requires review for plausible but uncertain matches', () => {
        const score = scoreTournamentMatch(
            {
                name: 'Essex Junior 2 Star',
                startDate: '2026-11-14',
                venue: 'Chelmsford',
                category: 'Junior',
            },
            {
                name: 'Essex Junior Open',
                startDate: '2026-11-15',
                venue: 'Chelmsford',
                category: 'Junior',
            },
        );

        expect(score.total).toBeGreaterThanOrEqual(0.7);
        expect(score.total).toBeLessThan(0.92);
        expect(score.decision).toBe('review');
    });

    it('rejects similarly named events on incompatible dates and venues', () => {
        const score = scoreTournamentMatch(
            {
                name: 'National Championships',
                startDate: '2026-03-01',
                venue: 'Nottingham',
                category: 'Senior',
            },
            {
                name: 'National Championships',
                startDate: '2026-09-01',
                venue: 'Birmingham',
                category: 'Senior',
            },
        );

        expect(score.total).toBeLessThan(0.7);
        expect(score.decision).toBe('none');
    });
});
