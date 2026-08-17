import { describe, expect, it } from 'vitest';
import { enumerateCompleteSourceDates } from '../source-date-range.js';
import {
    completeVettsDiscovery,
    vettsDiscoveryLimit,
} from '../tasks/scrapeVettsTournamentsTask.js';
import type { VettsTournamentLink } from '../vetts-parser.js';

function tournaments(count: number): VettsTournamentLink[] {
    return Array.from({ length: count }, (_value, index) => ({
        tournamentId: `tournament-${index}`,
        name: `Tournament ${index}`,
        url: `https://vetts.tournamentsoftware.com/tournament/tournament-${index}`,
    })) as VettsTournamentLink[];
}

describe('VETTS discovery completeness', () => {
    it('enumerates an inclusive event range beyond the old seven-day cap', () => {
        const dates = enumerateCompleteSourceDates('2026-08-01', '2026-08-12');
        expect(dates).toHaveLength(12);
        expect(dates[0]).toBe('2026-08-01');
        expect(dates.at(-1)).toBe('2026-08-12');
    });

    it('treats a missing end date as a one-day event', () => {
        expect(enumerateCompleteSourceDates('2026-08-17', null)).toEqual(['2026-08-17']);
    });

    it('rejects invalid, reversed and over-limit event ranges', () => {
        expect(() => enumerateCompleteSourceDates('2026-02-30', null)).toThrow(/invalid start date/);
        expect(() => enumerateCompleteSourceDates('2026-08-17', '2026-08-16')).toThrow(/precedes/);
        expect(() => enumerateCompleteSourceDates('2025-01-01', '2026-01-02', 366))
            .toThrow(/refusing partial discovery/);
    });

    it('has no tournament-count cap by default', () => {
        expect(vettsDiscoveryLimit(undefined)).toBeNull();
        expect(completeVettsDiscovery(tournaments(150), null)).toHaveLength(150);
    });

    it('fails instead of truncating when an explicit discovery guard is exceeded', () => {
        expect(() => completeVettsDiscovery(tournaments(31), 30))
            .toThrow(/discovery incomplete.*would truncate 31/);
    });

    it('validates explicit discovery guard configuration', () => {
        expect(vettsDiscoveryLimit('100')).toBe(100);
        expect(() => vettsDiscoveryLimit('0')).toThrow(/positive integer/);
        expect(() => vettsDiscoveryLimit('10001')).toThrow(/<= 10000/);
    });
});
