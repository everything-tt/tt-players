import { describe, expect, it } from 'vitest';
import { rankPlayerRivals, type RivalEncounter } from '../player-rivals-ranking.js';

function encounters(
  opponentId: string,
  opponentName: string,
  results: boolean[],
): RivalEncounter[] {
  return results.map((isWin, index) => ({
    opponent_id: opponentId,
    opponent_name: opponentName,
    is_win: isWin,
    played_at: `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`,
    encounter_id: `${opponentId}-${index}`,
  }));
}

describe('rankPlayerRivals', () => {
  it('ranks toughest and easiest rivals from opponents with at least three encounters', () => {
    const result = rankPlayerRivals([
      ...encounters('a', 'Alex Ace', [false, false, false, false]),
      ...encounters('b', 'Bea Block', [true, false, false, false]),
      ...encounters('c', 'Cara Counter', [true, true, true, true, true]),
      ...encounters('d', 'Dana Drive', [true, true, true, false]),
      ...encounters('e', 'Excluded Two', [false, false]),
    ]);

    expect(result.toughest.map((item) => [item.opponent_name, item.win_rate, item.played])).toEqual([
      ['Alex Ace', 0, 4],
      ['Bea Block', 25, 4],
      ['Dana Drive', 75, 4],
      ['Cara Counter', 100, 5],
    ]);
    expect(result.easiest.map((item) => item.opponent_name)).toEqual([
      'Cara Counter',
      'Dana Drive',
      'Bea Block',
      'Alex Ace',
    ]);
  });

  it('ranks improvement by comparing the first and second halves of chronological results', () => {
    const result = rankPlayerRivals([
      ...encounters('a', 'Biggest Gain', [false, false, true, true]),
      ...encounters('b', 'Smaller Gain', [false, true, true, true]),
      ...encounters('c', 'No Gain', [true, true, false, false]),
      ...encounters('d', 'Too Few', [false, true, true]),
    ]);

    expect(result.improving).toEqual([
      expect.objectContaining({
        opponent_name: 'Biggest Gain',
        first_half_win_rate: 0,
        second_half_win_rate: 100,
        delta_points: 100,
        played: 4,
      }),
      expect.objectContaining({
        opponent_name: 'Smaller Gain',
        first_half_win_rate: 50,
        second_half_win_rate: 100,
        delta_points: 50,
        played: 4,
      }),
    ]);
  });

  it('limits every category and resolves ties deterministically', () => {
    const input = ['Echo', 'Delta', 'Charlie', 'Bravo', 'Alpha'].flatMap((name, index) =>
      encounters(String(index), name, [false, false, false]),
    );

    const result = rankPlayerRivals(input, 4);

    expect(result.toughest.map((item) => item.opponent_name)).toEqual([
      'Alpha',
      'Bravo',
      'Charlie',
      'Delta',
    ]);
    expect(result.toughest).toHaveLength(4);
    expect(result.easiest).toHaveLength(4);
  });
});
