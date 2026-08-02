import { describe, expect, it } from 'vitest';
import { getFollowedPlayerIds, getPlayersTabMode } from './players-tab-model';

describe('players tab model', () => {
  it('shows following for an empty query', () => {
    expect(getPlayersTabMode('   ')).toBe('following');
  });

  it('shows the short-query state before three characters', () => {
    expect(getPlayersTabMode('ab')).toBe('short-query');
  });

  it('shows global search from three characters', () => {
    expect(getPlayersTabMode('abc')).toBe('search');
  });

  it('excludes the current player from followed ids without reordering the rest', () => {
    expect(getFollowedPlayerIds(
      [{ id: 'first' }, { id: 'me' }, { id: 'third' }],
      'me',
    )).toEqual(['first', 'third']);
  });
});
