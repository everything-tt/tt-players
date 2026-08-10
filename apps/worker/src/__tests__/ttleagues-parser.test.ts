import { describe, expect, it } from 'vitest';
import { parseTTLeaguesData } from '../parser.js';

function team(id: number, teamId: number, name: string) {
    return {
        id,
        teamId,
        name,
        displayName: name,
        score: null,
        clubId: null,
        userId: '',
        members: [],
        reserves: [],
        type: 1,
        points: null,
    };
}

function player(
    entrantId: number,
    userId: string,
    name: string,
    playerId: number,
    forfeit: unknown = null,
) {
    return { entrantId, userId, name, playerId, ordering: 0, type: 1, forfeit };
}

function set(
    id: number,
    matchId: number,
    homePlayers: ReturnType<typeof player>[],
    awayPlayers: ReturnType<typeof player>[],
    homeScore: number,
    awayScore: number,
) {
    return {
        id,
        matchId,
        scores: '',
        homeScore,
        awayScore,
        ordering: 0,
        fixed: true,
        completed: '2026-01-01T00:00:00Z',
        locked: true,
        homeId: homePlayers[0]?.entrantId ?? 0,
        awayId: awayPlayers[0]?.entrantId ?? 0,
        homePlayers,
        awayPlayers,
        games: [{ id: 1, home: 11, away: 0, ordering: 0 }],
    };
}

const forfeitMatch = {
    id: 960441,
    date: '2026-01-29T11:00:00Z',
    time: null,
    week: 20,
    name: 'Two',
    venue: null,
    competitionId: 4023,
    divisionId: 11214,
    leagueId: 207,
    hasResults: true,
    manual: false,
    forfeit: '2026-02-04T15:28:12.653Z',
    abandoned: null,
    round: null,
    home: team(104328, 84217, 'Stretford Harriers'),
    away: team(104331, 84219, 'Altrincham Social Crabs'),
};

describe('parseTTLeaguesData() player identity handling', () => {
    it('does not create players from team-level forfeit placeholders', () => {
        const result = parseTTLeaguesData({
            standings: [],
            matches: { groups: [], matches: [forfeitMatch] },
            sets: {
                '960441': [
                    set(
                        9634147,
                        960441,
                        [player(104328, '', 'Stretford Harriers', 9685943)],
                        [player(104331, '', 'Altrincham Social Crabs', 9685946, '2026-02-04T15:28:12.76Z')],
                        3,
                        0,
                    ),
                ],
            },
        });

        expect(result.players).toEqual([]);
        expect(result.teams.map((t) => t.name)).toEqual([
            'Stretford Harriers',
            'Altrincham Social Crabs',
        ]);
        expect(result.rubbers).toHaveLength(1);
        expect(result.rubbers[0]).toMatchObject({
            externalId: '9634147',
            homePlayers: [],
            awayPlayers: [],
            homeGamesWon: 3,
            awayGamesWon: 0,
            outcomeType: 'walkover',
        });
    });

    it('still extracts source-linked players and keeps normal rubbers when a match has both', () => {
        const result = parseTTLeaguesData({
            standings: [],
            matches: { groups: [], matches: [forfeitMatch] },
            sets: {
                '960441': [
                    set(
                        9634147,
                        960441,
                        [player(104328, '', 'Stretford Harriers', 9685943)],
                        [player(104331, '', 'Altrincham Social Crabs', 9685946, '2026-02-04T15:28:12.76Z')],
                        3,
                        0,
                    ),
                    set(
                        9634148,
                        960441,
                        [player(104328, 'user-1', 'Alice Smith', 1)],
                        [player(104331, 'user-2', 'Bob Jones', 2)],
                        3,
                        2,
                    ),
                ],
            },
        });

        expect(result.players.map((p) => p.name).sort()).toEqual(['Alice Smith', 'Bob Jones']);
        expect(result.rubbers).toHaveLength(2);
        const normal = result.rubbers.find((r) => r.externalId === '9634148');
        expect(normal).toMatchObject({
            homePlayers: ['user-1'],
            awayPlayers: ['user-2'],
            outcomeType: 'normal',
        });
    });

    it('ignores unregistered participants without a source userId', () => {
        const result = parseTTLeaguesData({
            standings: [],
            matches: { groups: [], matches: [forfeitMatch] },
            sets: {
                '960441': [
                    set(
                        9634147,
                        960441,
                        [player(999, '', 'Unregistered Player', 3)],
                        [player(104331, 'user-2', 'Bob Jones', 2)],
                        3,
                        2,
                    ),
                ],
            },
        });

        expect(result.players.map((p) => p.name)).toEqual(['Bob Jones']);
        expect(result.rubbers[0]).toMatchObject({
            homePlayers: [],
            awayPlayers: ['user-2'],
        });
    });
});
