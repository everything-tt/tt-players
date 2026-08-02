import { describe, expect, it } from 'vitest';
import {
  buildH2HCommonOpponentsPath,
  h2hCommonOpponentsQueryKey,
} from './h2h-common-opponents-query';

describe('H2H common opponents query contract', () => {
  it('separates cached pages by players and sort mode', () => {
    expect(h2hCommonOpponentsQueryKey('player-a', 'player-b', 'recent')).toEqual([
      'players',
      'h2h',
      'player-a',
      'player-b',
      'common-opponents',
      'recent',
    ]);
  });

  it('requests twenty rows and omits an empty cursor', () => {
    expect(buildH2HCommonOpponentsPath('player-a', 'player-b', 'evidence', null))
      .toBe('/players/player-a/h2h/player-b/common-opponents?sort=evidence&limit=20');
  });

  it('encodes the cursor when loading the next page', () => {
    expect(buildH2HCommonOpponentsPath('player-a', 'player-b', 'closest', 'next/value+1'))
      .toBe('/players/player-a/h2h/player-b/common-opponents?sort=closest&limit=20&cursor=next%2Fvalue%2B1');
  });
});
