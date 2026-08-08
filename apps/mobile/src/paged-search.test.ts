import { describe, expect, it } from 'vitest';
import {
  buildPlayerSearchPath,
  buildTournamentListPath,
  mergePageById,
  normalizePagedResponse,
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

  it('builds tournament page requests with saved and category filters', () => {
    expect(buildTournamentListPath({
      status: 'completed',
      query: 'Birmingham',
      savedIds: ['00000000-0000-0000-0000-000000000004'],
      categories: ['women', 'junior'],
      limit: 10,
      offset: 10,
    })).toBe('/events?status=completed&q=Birmingham&saved_ids=00000000-0000-0000-0000-000000000004&categories=junior%2Cwomen&include_total=false&limit=10&offset=10');
  });

  it('omits inactive tournament filters', () => {
    expect(buildTournamentListPath({
      status: 'upcoming',
      query: '',
      savedIds: [],
      categories: [],
      limit: 10,
      offset: 0,
    })).toBe('/events?status=upcoming&include_total=false&limit=10&offset=0');
  });

  it('normalizes the current paginated response envelope', () => {
    expect(normalizePagedResponse({
      data: [{ id: 'a' }, { id: 'b' }],
      total: 3,
      limit: 2,
      offset: 0,
      has_more: true,
    }, 0)).toEqual({
      data: [{ id: 'a' }, { id: 'b' }],
      total: 3,
      hasMore: true,
    });
  });

  it('treats a legacy data-only response as a complete snapshot', () => {
    expect(normalizePagedResponse({
      data: [{ id: 'a' }, { id: 'b' }],
    }, 0)).toEqual({
      data: [{ id: 'a' }, { id: 'b' }],
      total: null,
      hasMore: false,
    });
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
