import { describe, expect, it } from 'vitest';
import { compareCommonOpponents, type CommonOpponentSort } from './h2h-common-opponents.js';

function item(
    opponent_id: string,
    opponent_name: string,
    combined_played: number,
    edge: number,
    latest_played_at: string | null,
) {
    return {
        opponent_id,
        opponent_name,
        combined_played,
        edge,
        latest_played_at,
        player1: { played: combined_played / 2, wins: 0, losses: combined_played / 2, win_rate: 0 },
        player2: { played: combined_played / 2, wins: 0, losses: combined_played / 2, win_rate: 0 },
    };
}

function order(sort: CommonOpponentSort) {
    return [
        item('00000000-0000-4000-8000-000000000001', 'Alpha', 8, 40, '2026-01-01T00:00:00.000Z'),
        item('00000000-0000-4000-8000-000000000002', 'Bravo', 20, 5, '2025-01-01T00:00:00.000Z'),
        item('00000000-0000-4000-8000-000000000003', 'Charlie', 12, -60, '2026-03-01T00:00:00.000Z'),
        item('00000000-0000-4000-8000-000000000004', 'Delta', 14, 0, null),
    ].sort((left, right) => compareCommonOpponents(left, right, sort));
}

describe('compareCommonOpponents', () => {
    it('orders most evidence by combined matches', () => {
        expect(order('evidence').map((row) => row.opponent_name))
            .toEqual(['Bravo', 'Delta', 'Charlie', 'Alpha']);
    });

    it('orders most recent with undated opponents last', () => {
        expect(order('recent').map((row) => row.opponent_name))
            .toEqual(['Charlie', 'Alpha', 'Bravo', 'Delta']);
    });

    it('orders largest edge by absolute win-rate difference', () => {
        expect(order('edge').map((row) => row.opponent_name))
            .toEqual(['Charlie', 'Alpha', 'Bravo', 'Delta']);
    });

    it('orders closest records by the smallest absolute edge', () => {
        expect(order('closest').map((row) => row.opponent_name))
            .toEqual(['Delta', 'Bravo', 'Alpha', 'Charlie']);
    });
});
