import { describe, expect, it } from 'vitest';
import {
  buildPlayerSearchPath,
  buildTournamentListPath,
  mergePageById,
} from './paged-search';

describe('paged search helpers', () => {
  it('builds player page requests with active scope and saved ids', () => {
    expect(buildPlayerSearchPath({
      query: 'Smith',
      leagueIds: ['league-b', 'league-a'],
      savedIds: ['00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001'],
      limit: 10,
      offset: 20,
      allLeaguesCount: 4,
    })).toBe('/players/search?q=Smith&league_ids=league-a%2Cleague-b&saved_ids=00000000-0000-0000-0000-000000000001%2C00000000-0000-0000-0000-000000000002&limit=10&offset=20');
  });

  it('omits league ids when the selected scope contains every league', () => {
    expect(buildPlayerSearchPath({
      query: '',
      leagueIds: ['league-a', 'league-b'],
      savedIds: [],
      limit: 10,
      offset: 0,
      allLeaguesCount: 2,
    })).toBe('/players/search?limit=10&offset=0');
  });

  it('builds tournament page requests for the active lifecycle tab only', () => {
    expect(buildTournamentListPath({
      status: 'completed',
      query: 'Birmingham',
      savedIds: ['00000000-0000-0000-0000-000000000004'],
      limit: 10,
      offset: 10,
    })).toBe('/events?status=completed&q=Birmingham&saved_ids=00000000-0000-0000-0000-000000000004&limit=10&offset=10');
  });

  it('appends pages without duplicating ids', () => {
    expect(mergePageById(
      [{ id: 'a' }, { id: 'b' }],
      [{ id: 'b' }, { id: 'c' }],
      false,
    )).toEqual([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
  });

  it('replaces previous rows when a filter changes', () => {
    expect(mergePageById(
      [{ id: 'a' }],
      [{ id: 'b' }],
      true,
    )).toEqual([{ id: 'b' }]);
  });
});
