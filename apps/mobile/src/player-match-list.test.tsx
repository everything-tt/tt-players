import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { RubberItem } from './player-shared';
import {
  buildQuickJournalPath,
  formatMatchDateParts,
  formatMatchResult,
  mergePlayerMatchPage,
  readJournalPrefill,
} from './player-match-list';

export const matchFixture = (id: string, overrides: Partial<RubberItem> = {}): RubberItem => ({
  id,
  fixture_id: `fixture-${id}`,
  date: '2026-04-13',
  source: 'league',
  source_label: 'Brentwood & District TTL · Premier Division',
  event_id: null,
  event_name: null,
  league: 'Brentwood & District TTL',
  opponent: 'Malcolm Henstock',
  opponent_id: 'opponent-1',
  result: 'Won 3-1',
  isWin: true,
  ...overrides,
});

describe('player match list helpers', () => {
  it('appends pages without duplicate match ids', () => {
    expect(mergePlayerMatchPage(
      [matchFixture('a'), matchFixture('b')],
      [matchFixture('b'), matchFixture('c')],
      false,
    ).map((item) => item.id)).toEqual(['a', 'b', 'c']);
  });

  it('replaces rows when the player or source scope changes', () => {
    expect(mergePlayerMatchPage([matchFixture('a')], [matchFixture('b')], true).map((item) => item.id))
      .toEqual(['b']);
  });

  it('uses subtle semantic result tones', () => {
    expect(formatMatchResult('Won 3-1', true)).toEqual({ label: 'Won 3-1', tone: 'success' });
    expect(formatMatchResult('Lost 0-3', false)).toEqual({ label: 'Lost 0-3', tone: 'danger' });
  });

  it('formats a compact English date block', () => {
    expect(formatMatchDateParts('2026-04-13')).toEqual({ day: '13', month: 'Apr', year: '2026' });
  });

  it('builds validated Quick Journal query parameters', () => {
    expect(buildQuickJournalPath('player-1', matchFixture('a')))
      .toBe('player/player-1/journal?date=2026-04-13&opponent=Malcolm+Henstock&outcome=win');
  });

  it('ignores invalid journal prefill values', () => {
    expect(readJournalPrefill(
      new URLSearchParams('date=nope&opponent=%20&outcome=practice'),
      '2026-08-02',
    )).toEqual({ date: '2026-08-02', opponent: '', outcome: 'win' });
  });

  it('pages player matches in batches of twenty and resets by player/source', () => {
    const source = readFileSync(new URL('./hooks/usePagedPlayerMatches.ts', import.meta.url), 'utf8');
    expect(source).toContain('pageSize = 20');
    expect(source).toContain('[playerId, source, pageSize]');
    expect(source).toContain('mergePlayerMatchPage');
  });
});
