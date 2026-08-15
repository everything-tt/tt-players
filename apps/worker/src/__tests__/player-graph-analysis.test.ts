import { describe, expect, it } from 'vitest';
import {
    analysePlayerGraph,
    buildWeightedPlayerEdges,
    detectWeightedCommunities,
    renderPlayerGraphMarkdown,
    type PlayerGraphMatch,
} from '../player-graph-analysis.js';
import {
    DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS,
    resolvePlayerGraphDecay,
} from '../player-graph-run-config.js';

function match(
    rubberId: string,
    homePlayerId: string,
    awayPlayerId: string,
    options: Partial<PlayerGraphMatch> = {},
): PlayerGraphMatch {
    return {
        rubberId,
        playedAt: '2026-06-30',
        homePlayerId,
        homePlayerName: homePlayerId.toUpperCase(),
        awayPlayerId,
        awayPlayerName: awayPlayerId.toUpperCase(),
        homeGamesWon: 3,
        awayGamesWon: 1,
        leagueId: 'league-1',
        leagueName: 'Essex League',
        competitionId: 'division-1',
        competitionName: 'Division 1',
        homeTeamName: 'Home Club',
        awayTeamName: 'Away Club',
        ...options,
    };
}

function densePair(
    prefix: string,
    a: string,
    b: string,
    count: number,
    competitionName: string,
): PlayerGraphMatch[] {
    return Array.from({ length: count }, (_, index) =>
        match(`${prefix}-${index}`, a, b, {
            competitionId: competitionName.toLowerCase().replaceAll(' ', '-'),
            competitionName,
        })
    );
}

describe('player graph Stage 1 analysis', () => {
    it('uses the Stage 1 run-config half-life default when none is provided', () => {
        expect(DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS).toBe(730);
        expect(resolvePlayerGraphDecay().effectiveHalfLifeDays).toBe(
            DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS,
        );

        const edges = buildWeightedPlayerEdges([
            match('recent', 'a', 'b'),
            match('year-old', 'a', 'b', { playedAt: '2025-06-30' }),
        ], {
            windowStart: '2025-06-30',
            windowEnd: '2026-06-30',
        });

        // 0 days old → 1.0; ~365 days old with 730-day half-life → ~0.707
        expect(edges).toHaveLength(1);
        expect(edges[0]!.weight).toBeCloseTo(1 + Math.pow(0.5, 365 / 730), 5);

        const report = analysePlayerGraph([
            match('recent', 'a', 'b'),
        ], {
            windowStart: '2026-06-01',
            windowEnd: '2026-06-30',
        });
        expect(report.methodology.halfLifeDays).toBe(DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS);
    });

    it('aggregates repeated opponents with exponential recency weighting', () => {
        const edges = buildWeightedPlayerEdges([
            match('recent', 'a', 'b'),
            match('half-life-old', 'b', 'a', {
                playedAt: '2026-06-20',
                homeGamesWon: 0,
                awayGamesWon: 3,
            }),
        ], {
            windowStart: '2026-06-01',
            windowEnd: '2026-06-30',
            halfLifeDays: 10,
        });

        expect(edges).toHaveLength(1);
        expect(edges[0]).toMatchObject({
            playerAId: 'a',
            playerBId: 'b',
            matchCount: 2,
            playerAWins: 2,
            playerBWins: 0,
            playerAGamesWon: 6,
            playerBGamesWon: 1,
            latestMatchAt: '2026-06-30',
        });
        expect(edges[0]!.weight).toBeCloseTo(1.5, 6);
    });

    it('does not count equal game scores as a win for either side', () => {
        const edges = buildWeightedPlayerEdges([
            match('tied', 'a', 'b', {
                homeGamesWon: 2,
                awayGamesWon: 2,
            }),
        ], {
            windowStart: '2026-06-01',
            windowEnd: '2026-06-30',
            halfLifeDays: 180,
        });

        expect(edges).toHaveLength(1);
        expect(edges[0]).toMatchObject({
            matchCount: 1,
            playerAWins: 0,
            playerBWins: 0,
            playerAGamesWon: 2,
            playerBGamesWon: 2,
        });
    });

    it('separates dense playing pools linked by a weak cross-community match', () => {
        const matches = [
            ...densePair('ab', 'a', 'b', 3, 'Division A'),
            ...densePair('ac', 'a', 'c', 3, 'Division A'),
            ...densePair('bc', 'b', 'c', 3, 'Division A'),
            ...densePair('de', 'd', 'e', 3, 'Division B'),
            ...densePair('df', 'd', 'f', 3, 'Division B'),
            ...densePair('ef', 'e', 'f', 3, 'Division B'),
            match('bridge', 'c', 'd', {
                competitionId: 'open',
                competitionName: 'County Open',
            }),
        ];
        const edges = buildWeightedPlayerEdges(matches, {
            windowStart: '2026-06-01',
            windowEnd: '2026-06-30',
            halfLifeDays: 180,
        });
        const { membershipByPlayer, modularity } = detectWeightedCommunities(edges);

        expect(membershipByPlayer.get('a')).toBe(membershipByPlayer.get('b'));
        expect(membershipByPlayer.get('b')).toBe(membershipByPlayer.get('c'));
        expect(membershipByPlayer.get('d')).toBe(membershipByPlayer.get('e'));
        expect(membershipByPlayer.get('e')).toBe(membershipByPlayer.get('f'));
        expect(membershipByPlayer.get('a')).not.toBe(membershipByPlayer.get('d'));
        expect(new Set(membershipByPlayer.values()).size).toBe(2);
        expect(modularity).toBeGreaterThan(0.3);
    });

    it('surfaces bridge players, metadata concentration and an explicit review gate', () => {
        const matches = [
            ...densePair('ab', 'a', 'b', 3, 'Division A'),
            ...densePair('ac', 'a', 'c', 3, 'Division A'),
            ...densePair('bc', 'b', 'c', 3, 'Division A'),
            ...densePair('de', 'd', 'e', 3, 'Division B'),
            ...densePair('df', 'd', 'f', 3, 'Division B'),
            ...densePair('ef', 'e', 'f', 3, 'Division B'),
            match('bridge', 'c', 'd', {
                leagueId: 'county',
                leagueName: 'County Events',
                competitionId: 'open',
                competitionName: 'County Open',
                homeTeamName: null,
                awayTeamName: null,
            }),
        ];

        const report = analysePlayerGraph(matches, {
            windowStart: '2026-06-01',
            windowEnd: '2026-06-30',
            halfLifeDays: 180,
        });

        expect(report.totals.communities).toBe(2);
        expect(report.crossCommunityEdges).toHaveLength(1);
        expect(report.crossCommunityEdges[0]!.strongestPlayerPair).toBe('C ↔ D');
        expect(report.bridgePlayers.map((player) => player.playerId).sort()).toEqual(['c', 'd']);
        expect(report.communities[0]!.dominantCompetition?.share).toBeGreaterThan(0.8);
        expect(report.validationSignals.recommendation).toBe('review_required');

        const markdown = renderPlayerGraphMarkdown(report);
        expect(markdown).toContain('REVIEW REQUIRED before Stage 2');
        expect(markdown).toContain('Bridge / connector players');
        expect(markdown).toContain('Division A');
    });
});
