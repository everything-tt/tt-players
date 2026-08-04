import { describe, expect, it } from 'vitest';
import type { PlayerRivalRecord, PlayerRivalsResponse } from './player-insights-types';
import type { H2HResponse, RubberItem } from './player-shared';
import {
  buildRecentOpponentCandidates,
  buildRivalryOrbitLayout,
  buildRivalryOrbitRecords,
  mergeRivalryOrbitRecords,
  ratingZone,
  rivalRecordFromH2H,
  rivalryCloseness,
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

function match(opponentId: string, opponentName: string, id: string): RubberItem {
  return {
    id,
    fixture_id: `fixture-${id}`,
    date: '2026-08-01',
    source: 'league',
    source_label: 'League',
    event_id: null,
    event_name: null,
    league: 'Test League',
    opponent: opponentName,
    opponent_id: opponentId,
    result: '3-2',
    isWin: true,
  };
}

describe('rivalry scoring', () => {
  it('favours established balanced rivalries over one-sided records', () => {
    const balanced = rival('balanced', 'Balanced', 6, 5);
    const oneSided = rival('one-sided', 'One sided', 8, 1);

    expect(rivalryCloseness(balanced)).toBeGreaterThan(rivalryCloseness(oneSided));
    expect(rivalryImportance(balanced)).toBeGreaterThan(rivalryImportance(oneSided));
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

  it('keeps up to eight established rivals and ranks the closest record first', () => {
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

    expect(records).toHaveLength(8);
    expect(records[0]?.opponent_id).toBe('c');
  });
});

describe('recent opponent enrichment', () => {
  it('prioritises frequently encountered recent opponents and excludes existing rivals', () => {
    const candidates = buildRecentOpponentCandidates([
      match('existing', 'Existing', '1'),
      match('new-a', 'New A', '2'),
      match('new-b', 'New B', '3'),
      match('new-a', 'New A', '4'),
      match('new-c', 'New C', '5'),
    ], ['existing'], 2);

    expect(candidates).toEqual([
      { opponent_id: 'new-a', opponent_name: 'New A', recent_meetings: 2 },
      { opponent_id: 'new-b', opponent_name: 'New B', recent_meetings: 1 },
    ]);
  });

  it('turns a fetched H2H into a ranked rival record', () => {
    const h2h: H2HResponse = {
      player1_wins: 4,
      player2_wins: 3,
      encounters: [],
    };
    const record = rivalRecordFromH2H(
      { opponent_id: 'new-a', opponent_name: 'New A', recent_meetings: 2 },
      h2h,
    );

    expect(record).toMatchObject({
      opponent_id: 'new-a',
      played: 7,
      wins: 4,
      losses: 3,
      win_rate: 57,
    });
  });

  it('merges recent discoveries and caps the orbit at ten close rivalries', () => {
    const records = mergeRivalryOrbitRecords([
      rival('a', 'A', 6, 5),
      rival('b', 'B', 5, 4),
      rival('c', 'C', 4, 4),
      rival('d', 'D', 4, 3),
      rival('e', 'E', 3, 3),
      rival('f', 'F', 3, 2),
      rival('g', 'G', 2, 2),
      rival('h', 'H', 2, 1),
      rival('i', 'I', 5, 0),
      rival('j', 'J', 4, 0),
      rival('k', 'K', 3, 0),
    ], 10);

    expect(records).toHaveLength(10);
    expect(records.some((record) => record.opponent_id === 'k')).toBe(false);
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

  it('provides distinct slots for ten rivals in the same zone', () => {
    const records = Array.from({ length: 10 }, (_, index) => ({
      ...rival(`rival-${index}`, `Rival ${index}`, 5, 4),
      importance: 20 - index,
      rating: 1800,
    }));
    const points = buildRivalryOrbitLayout(1700, records);
    const positions = new Set(points.map((point) => `${point.x}:${point.y}`));

    expect(points).toHaveLength(10);
    expect(positions.size).toBe(10);
  });
});
