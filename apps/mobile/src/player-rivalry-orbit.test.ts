import { describe, expect, it } from 'vitest';
import type { PlayerRivalRecord, PlayerRivalsResponse } from './player-insights-types';
import {
  buildRivalryOrbitLayout,
  buildRivalryOrbitRecords,
  ratingZone,
  rivalryImportance,
} from './player-rivalry-orbit';

function rival(
  opponentId: string,
  opponentName: string,
  wins: number,
  losses: number,
): PlayerRivalRecord {
  const played = wins + losses;
  return {
    opponent_id: opponentId,
    opponent_name: opponentName,
    played,
    wins,
    losses,
    win_rate: played > 0 ? Math.round((wins / played) * 100) : 0,
  };
}

function response(
  toughest: PlayerRivalRecord[],
  easiest: PlayerRivalRecord[],
): PlayerRivalsResponse {
  return {
    player_id: 'focus',
    toughest,
    easiest,
    improving: [],
  };
}

describe('rivalryImportance', () => {
  it('favours established balanced rivalries over one-sided records', () => {
    expect(rivalryImportance(rival('balanced', 'Balanced', 6, 5)))
      .toBeGreaterThan(rivalryImportance(rival('one-sided', 'One sided', 8, 1)));
  });
});

describe('buildRivalryOrbitRecords', () => {
  it('deduplicates opponents that appear in both rival lists', () => {
    const shared = rival('shared', 'Shared Rival', 4, 4);
    const records = buildRivalryOrbitRecords(response(
      [shared, rival('tough', 'Tough Rival', 2, 5)],
      [shared, rival('easy', 'Easy Rival', 6, 1)],
    ));

    expect(records.filter((record) => record.opponent_id === 'shared')).toHaveLength(1);
  });

  it('keeps the most meaningful six connections', () => {
    const records = buildRivalryOrbitRecords(response(
      [
        rival('a', 'A', 6, 5),
        rival('b', 'B', 5, 4),
        rival('c', 'C', 4, 4),
        rival('d', 'D', 3, 4),
      ],
      [
        rival('e', 'E', 8, 2),
        rival('f', 'F', 6, 1),
        rival('g', 'G', 3, 0),
        rival('h', 'H', 2, 1),
      ],
    ));

    expect(records).toHaveLength(6);
    expect(records[0]?.opponent_id).toBe('a');
    expect(records.some((record) => record.opponent_id === 'h')).toBe(false);
  });
});

describe('ratingZone', () => {
  it('uses a stable rating hierarchy and treats missing ratings as similar', () => {
    expect(ratingZone(1700, 1760)).toBe('higher');
    expect(ratingZone(1700, 1680)).toBe('similar');
    expect(ratingZone(1700, 1640)).toBe('lower');
    expect(ratingZone(1700, null)).toBe('similar');
  });
});

describe('buildRivalryOrbitLayout', () => {
  it('puts the strongest connection in the closest slot for each rating zone', () => {
    const weaker = { ...rival('weak', 'Weak', 2, 1), importance: 2, rating: 1790 };
    const stronger = { ...rival('strong', 'Strong', 6, 5), importance: 10, rating: 1780 };
    const points = buildRivalryOrbitLayout(1700, [weaker, stronger]);

    const strongPoint = points.find((point) => point.opponent_id === 'strong');
    const weakPoint = points.find((point) => point.opponent_id === 'weak');

    expect(strongPoint).toMatchObject({ zone: 'higher', x: 360, y: 142 });
    expect(weakPoint).toMatchObject({ zone: 'higher', x: 205, y: 112 });
  });
});
