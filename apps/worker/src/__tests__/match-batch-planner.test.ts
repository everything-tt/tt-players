import { describe, expect, it } from 'vitest';
import { selectMatchesNeedingResults } from '../match-batch-planner.js';
import type { Match } from '../zod-schemas.js';

function match(id: number, hasResults: boolean): Match {
    return {
        id,
        date: '2026-01-01',
        time: null,
        week: null,
        name: `Match ${id}`,
        venue: null,
        competitionId: 1,
        divisionId: 1,
        leagueId: 1,
        hasResults,
        manual: false,
        forfeit: null,
        abandoned: null,
        round: null,
        home: {
            id: id * 10,
            teamId: id * 10,
            name: 'Home',
            displayName: 'Home',
            score: null,
            clubId: null,
            userId: null,
            members: [],
            reserves: [],
            type: 0,
            points: null,
        },
        away: {
            id: id * 10 + 1,
            teamId: id * 10 + 1,
            name: 'Away',
            displayName: 'Away',
            score: null,
            clubId: null,
            userId: null,
            members: [],
            reserves: [],
            type: 0,
            points: null,
        },
    };
}

describe('match result batch planner', () => {
    it('selects missing, incomplete, invalid-date, and stale completed fixtures', () => {
        const now = Date.parse('2026-07-31T00:00:00Z');
        const week = 7 * 24 * 60 * 60 * 1000;
        const selected = selectMatchesNeedingResults(
            [match(1, true), match(2, true), match(3, true), match(4, true), match(5, false)],
            [
                { external_id: '2', status: 'upcoming', updated_at: new Date(now) },
                { external_id: '3', status: 'completed', updated_at: new Date(now - week - 1) },
                { external_id: '4', status: 'completed', updated_at: 'not-a-date' },
                { external_id: '5', status: 'completed', updated_at: new Date(now - week - 1) },
            ],
            now,
            week,
        );

        expect(selected.map(({ id }) => id)).toEqual([1, 2, 3, 4]);
    });

    it('skips fresh completed results', () => {
        const now = Date.parse('2026-07-31T00:00:00Z');
        const selected = selectMatchesNeedingResults(
            [match(1, true)],
            [{ external_id: '1', status: 'completed', updated_at: new Date(now - 1000) }],
            now,
            7 * 24 * 60 * 60 * 1000,
        );

        expect(selected).toEqual([]);
    });
});
