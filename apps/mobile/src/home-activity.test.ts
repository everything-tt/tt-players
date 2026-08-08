import { describe, expect, it } from 'vitest';
import {
  buildHomeScopeKey,
  buildPersonalHomeStories,
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

  it('turns a current winning streak into a high-priority personal story', () => {
    const stories = buildPersonalHomeStories({
      recentResults: ['W', 'W', 'W', 'L', 'W'],
      currentRating: 1912,
      ratingHistory: [],
    });

    expect(stories[0]).toMatchObject({
      kind: 'personal-form',
      priority: 118,
      title: "You're on a 3-match winning streak",
      subtitle: '4 wins in your last 5 singles',
      trailing: '3 straight',
    });
  });

  it('surfaces strong recent form even without a three-match streak', () => {
    const stories = buildPersonalHomeStories({
      recentResults: ['W', 'W', 'L', 'W', 'W'],
      currentRating: 1912,
      ratingHistory: [],
    });

    expect(stories[0]).toMatchObject({
      kind: 'personal-form',
      priority: 108,
      title: "You've won 4 of your last 5",
      subtitle: 'Strong recent singles form',
      trailing: 'In form',
    });
  });

  it('prefers a crossed round-number milestone when the three-month history proves it', () => {
    const stories = buildPersonalHomeStories({
      recentResults: ['W', 'L', 'W', 'L', 'W'],
      currentRating: 1912,
      ratingHistory: [
        { rating: 1840 },
        { rating: 1888 },
        { rating: 1912 },
      ],
    });

    expect(stories).toContainEqual(expect.objectContaining({
      kind: 'rating-milestone',
      priority: 106,
      title: 'You crossed 1,900',
      subtitle: 'Now 1,912 · up 72 from your 3-month low',
      trailing: 'Milestone',
    }));
    expect(stories.some((story) => story.kind === 'recent-rating-high')).toBe(false);
  });

  it('falls back to a meaningful three-month rating high when no round threshold was crossed', () => {
    const stories = buildPersonalHomeStories({
      recentResults: ['W', 'L', 'W', 'L', 'W'],
      currentRating: 1948,
      ratingHistory: [
        { rating: 1901 },
        { rating: 1920 },
        { rating: 1948 },
      ],
    });

    expect(stories).toContainEqual(expect.objectContaining({
      kind: 'recent-rating-high',
      priority: 102,
      title: "You're at a 3-month rating high",
      subtitle: '1,948 rating · up 47 from the low in this period',
      trailing: '3m high',
    }));
  });

  it('does not call a flat or one-point rating history a meaningful high', () => {
    expect(buildPersonalHomeStories({
      recentResults: [],
      currentRating: 1912,
      ratingHistory: [{ rating: 1912 }],
    })).toEqual([]);

    expect(buildPersonalHomeStories({
      recentResults: [],
      currentRating: 1912,
      ratingHistory: [{ rating: 1902 }, { rating: 1912 }],
    })).toEqual([]);
  });

  it('ranks personal and higher priority stories ahead of generic stories', () => {
    const ranked = rankHomeStories([
      { id: 'leader', priority: 60 },
      { id: 'generic-result', priority: 75 },
      { id: 'personal-result', priority: 110 },
      { id: 'personal-form', priority: 108 },
      { id: 'riser', priority: 95 },
      { id: 'second-result', priority: 65 },
    ], 4);

    expect(ranked.map((story) => story.id)).toEqual([
      'personal-result',
      'personal-form',
      'riser',
      'generic-result',
    ]);
  });
});
