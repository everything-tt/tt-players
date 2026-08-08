import { describe, expect, it } from 'vitest';
import {
  buildHomeScopeKey,
  diffHomeVisit,
  rankHomeStories,
  type HomeVisitSnapshot,
} from './home-activity';

function snapshot(overrides: Partial<HomeVisitSnapshot> = {}): HomeVisitSnapshot {
  return {
    seenAt: '2026-08-07T18:00:00.000Z',
    scopeKey: 'player-1::league-1',
    rating: 1894,
    rank: 137,
    recentResultIds: ['old-result'],
    topTeamId: 'team-old',
    topTeamName: 'Hutton A',
    topRiserPlayerId: 'riser-old',
    topRiserName: 'Previous Riser',
    ...overrides,
  };
}

describe('Home activity briefing', () => {
  it('builds a stable scope key from player and leagues', () => {
    expect(buildHomeScopeKey('player-1', ['league-b', 'league-a', 'league-a']))
      .toBe('player-1::league-a,league-b');
    expect(buildHomeScopeKey(null, [])).toBe('anonymous::all');
  });

  it('summarises meaningful changes since the previous visit', () => {
    const changes = diffHomeVisit(
      snapshot(),
      {
        scopeKey: 'player-1::league-1',
        rating: 1912,
        rank: 126,
        recentResultIds: ['result-1', 'result-2'],
        topTeamId: 'team-rowhedge',
        topTeamName: 'Rowhedge K',
        topRiserPlayerId: 'riser-harrison',
        topRiserName: 'Harrison Hill',
      },
    );

    expect(changes.map((change) => change.kind)).toEqual([
      'personal-rating',
      'new-results',
      'leader-change',
      'riser-change',
    ]);
    expect(changes[0]?.title).toBe('Your rating moved +18');
    expect(changes[0]?.subtitle).toContain('up 11 places to #126');
    expect(changes[1]?.title).toBe('2 new league results');
    expect(changes[2]?.title).toBe('New league leader: Rowhedge K');
  });

  it('does not compare snapshots from a different personalisation scope', () => {
    expect(diffHomeVisit(snapshot(), {
      ...snapshot(),
      scopeKey: 'player-2::league-1',
    })).toEqual([]);
  });

  it('ranks personal and higher priority stories ahead of generic stories', () => {
    const ranked = rankHomeStories([
      { id: 'leader', priority: 60 },
      { id: 'generic-result', priority: 75 },
      { id: 'personal-result', priority: 110 },
      { id: 'riser', priority: 95 },
      { id: 'second-result', priority: 65 },
    ], 4);

    expect(ranked.map((story) => story.id)).toEqual([
      'personal-result',
      'riser',
      'generic-result',
      'second-result',
    ]);
  });
});
