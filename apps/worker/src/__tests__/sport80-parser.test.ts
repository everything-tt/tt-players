import { describe, expect, it } from 'vitest';
import {
    extractSport80AthleteId,
    parseSport80EventName,
    parseSport80EventResults,
    parseSport80PlayerCell,
    parseSport80RankingPlayerName,
    parseSport80Round,
    sport80Timestamp,
    sport80RankingPlayerExternalId,
    sport80PlayerExternalId,
} from '../sport80-parser.js';

describe('Sport80 parser', () => {
    it('extracts category, player name, membership number, and winner flag', () => {
        expect(parseSport80PlayerCell('Senior - Isaac Wong (330488)')).toEqual({
            category: 'Senior',
            name: 'Isaac Wong',
            membershipNo: '330488',
            isWinner: false,
        });

        expect(parseSport80PlayerCell('Senior - Jaycee Chan (1468) - WINNER')).toEqual({
            category: 'Senior',
            name: 'Jaycee Chan',
            membershipNo: '1468',
            isWinner: true,
        });

        expect(parseSport80PlayerCell('Senior - Tom Jarvis (9293) WINNER ')).toEqual({
            category: 'Senior',
            name: 'Tom Jarvis',
            membershipNo: '9293',
            isWinner: true,
        });
    });

    it('creates deterministic IDs for member and name-only players', () => {
        expect(sport80PlayerExternalId(parseSport80PlayerCell('Senior - Isaac Wong (330488)')))
            .toBe('tte:330488');

        expect(sport80PlayerExternalId(parseSport80PlayerCell('Senior - Csaba ANDRAS WINNER')))
            .toBe('name:senior:csaba-andras');
    });

    it('normalizes unset and knockout rounds', () => {
        expect(parseSport80Round({ type: 'unset' })).toEqual({
            roundName: 'group',
            roundOrder: 10,
        });

        expect(parseSport80Round('quarter_final')).toEqual({
            roundName: 'quarter_final',
            roundOrder: 70,
        });
    });

    it('maps event rows to individual fixtures and win-loss-only rubbers', () => {
        const parsed = parseSport80EventResults({
            eventId: '7512',
            eventName: 'Horsham Spinners Senior 2* - 2026-04-26: Senior',
            eventDate: '2026-04-26',
            rows: [
                {
                    id: 864084,
                    date_and_time: '2026-04-26 09:30',
                    round: { type: 'unset' },
                    home: 'Senior - Russell Perry (196348)',
                    away: 'Senior - Jack Anthony (6487) - WINNER',
                },
                {
                    id: 864115,
                    date_and_time: '2026-04-26 09:30',
                    round: 'final',
                    home: 'Senior - Isaac Wong (330488)',
                    away: 'Senior - Jaycee Chan (1468) - WINNER',
                },
            ],
        });

        expect(parsed.teams).toEqual([]);
        expect(parsed.players.map((p) => p.name).sort()).toEqual([
            'Isaac Wong',
            'Jack Anthony',
            'Jaycee Chan',
            'Russell Perry',
        ]);
        expect(parsed.fixtures).toEqual([
            {
                externalId: 'sport80:event:7512:round:group',
                homeTeamExternalId: null,
                awayTeamExternalId: null,
                datePlayed: '2026-04-26',
                status: 'completed',
                roundName: 'group',
                roundOrder: 10,
            },
            {
                externalId: 'sport80:event:7512:round:final',
                homeTeamExternalId: null,
                awayTeamExternalId: null,
                datePlayed: '2026-04-26',
                status: 'completed',
                roundName: 'final',
                roundOrder: 90,
            },
        ]);
        expect(parsed.rubbers).toMatchObject([
            {
                externalId: 'sport80:result:864084',
                homePlayers: ['tte:196348'],
                awayPlayers: ['tte:6487'],
                homeGamesWon: 0,
                awayGamesWon: 1,
                scoreSource: 'win_loss_only',
                playedAt: '2026-04-26 09:30:00',
            },
            {
                externalId: 'sport80:result:864115',
                homePlayers: ['tte:330488'],
                awayPlayers: ['tte:1468'],
                homeGamesWon: 0,
                awayGamesWon: 1,
                scoreSource: 'win_loss_only',
                playedAt: '2026-04-26 09:30:00',
            },
        ]);
    });

    it('parses event display fields from source event names', () => {
        expect(parseSport80EventName('Huddersfield Junior 1 Star - 2026-04-26: Junior')).toEqual({
            displayName: 'Huddersfield Junior 1 Star',
            dateFromName: '2026-04-26',
            category: 'Junior',
        });

        expect(parseSport80EventName('Under 11-14 National Championships - 2014-06-01:')).toEqual({
            displayName: 'Under 11-14 National Championships',
            dateFromName: '2014-06-01',
            category: null,
        });
    });

    it('normalizes Sport80 date_and_time values to timestamps', () => {
        expect(sport80Timestamp('2026-04-26 09:30')).toBe('2026-04-26 09:30:00');
        expect(sport80Timestamp('2026-04-26 09:30:15')).toBe('2026-04-26 09:30:15');
        expect(sport80Timestamp(null)).toBeNull();
    });

    it('extracts ranking player identity and athlete id', () => {
        const player = parseSport80RankingPlayerName('Tom Jarvis (9293)');
        expect(player).toEqual({
            name: 'Tom Jarvis',
            membershipNo: '9293',
        });
        expect(sport80RankingPlayerExternalId(player)).toBe('tte:9293');

        expect(parseSport80RankingPlayerName('SGOUROPOULOS Ioannis')).toEqual({
            name: 'SGOUROPOULOS Ioannis',
            membershipNo: null,
        });
        expect(sport80RankingPlayerExternalId({ name: 'SGOUROPOULOS Ioannis', membershipNo: null }))
            .toBe('name:ranking:sgouropoulos-ioannis');

        expect(extractSport80AthleteId([
            { route: '/public/rankings/member/12785/category/24' },
        ])).toBe('12785');
        expect(extractSport80AthleteId({
            route: '/public/rankings/member/7940/category/24',
        })).toBe('7940');

        expect(parseSport80RankingPlayerName({ text: '<span>Anna Hursey (445)</span>' })).toEqual({
            name: 'Anna Hursey',
            membershipNo: '445',
        });
    });
});
