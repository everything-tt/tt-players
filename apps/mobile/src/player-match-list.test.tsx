import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PlayerMatchList } from './components/PlayerMatchList';
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

const databaseTimestamp = 'Mon Apr 13 2026 00:00:00 GMT+0000 (Coordinated Universal Time)';

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

  it('keeps the legacy result formatter stable for non-migrated consumers', () => {
    expect(formatMatchResult('Won 3-1', true)).toEqual({ label: 'Won 3-1', tone: 'success' });
    expect(formatMatchResult('Lost 0-3', false)).toEqual({ label: 'Lost 0-3', tone: 'danger' });
  });

  it('formats a compact English date', () => {
    expect(formatMatchDateParts('2026-04-13')).toEqual({ day: '13', month: 'Apr', year: '2026' });
  });

  it('formats database timestamp strings without losing their year', () => {
    expect(formatMatchDateParts(databaseTimestamp)).toEqual({ day: '13', month: 'Apr', year: '2026' });
  });

  it('builds validated Quick Journal query parameters', () => {
    expect(buildQuickJournalPath('player-1', matchFixture('a')))
      .toBe('player/player-1/journal?date=2026-04-13&opponent=Malcolm+Henstock&outcome=win');
  });

  it('normalises database timestamp strings for Quick Journal', () => {
    expect(buildQuickJournalPath('player-1', matchFixture('a', { date: databaseTimestamp })))
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

describe('PlayerMatchList', () => {
  const callbacks = {
    onOpenMatch: () => undefined,
    onOpenOpponent: () => undefined,
    onQuickJournal: () => undefined,
    onLoadMore: () => undefined,
    onRetry: () => undefined,
  };

  const renderList = (quickJournalEnabled: boolean, match = matchFixture('a')) => renderToStaticMarkup(
    <PlayerMatchList
      playerId="player-1"
      matches={[match]}
      total={1}
      hasMore={false}
      isLoadingInitial={false}
      isLoadingMore={false}
      error={null}
      quickJournalEnabled={quickJournalEnabled}
      {...callbacks}
    />,
  );

  it('uses the shared match record row with a leading detailed score', () => {
    const markup = renderList(false);

    expect(markup).toContain('tt-match-record-row');
    expect(markup).toContain('tt-match-record-score--win');
    expect(markup).toContain('3–1');
    expect(markup).toContain('Won 3 games to 1');
    expect(markup).toContain('Brentwood &amp; District TTL · Premier Division');
    expect(markup).toContain('13 Apr 2026');
    expect(markup).not.toContain('Won 3-1</span>');
    expect(markup).not.toContain('tt-player-match-meta');
  });

  it('uses W or L when the detailed score is unavailable', () => {
    const winMarkup = renderList(false, matchFixture('win-only', { result: 'Won' }));
    const lossMarkup = renderList(false, matchFixture('loss-only', { result: 'Lost', isWin: false }));

    expect(winMarkup).toContain('>W<');
    expect(winMarkup).toContain('Won, detailed score unavailable');
    expect(lossMarkup).toContain('>L<');
    expect(lossMarkup).toContain('Lost, detailed score unavailable');
  });

  it('uses the row as the opponent action and direct secondary buttons for my matches', () => {
    const markup = renderList(true);

    expect(markup).toContain('Open Malcolm Henstock profile');
    expect(markup).toContain('Journal match against Malcolm Henstock');
    expect(markup).toContain('View fixture for match against Malcolm Henstock');
    expect(markup).not.toContain('Match actions for Malcolm Henstock');
    expect(markup).not.toContain('fa-ellipsis-v');
  });

  it('shows only the fixture or event action on another player profile', () => {
    const leagueMarkup = renderList(false);
    const eventMarkup = renderList(false, matchFixture('event', {
      source: 'tournament',
      event_id: 'event-1',
    }));

    expect(leagueMarkup).toContain('View fixture for match against Malcolm Henstock');
    expect(leagueMarkup).not.toContain('Journal match against Malcolm Henstock');
    expect(eventMarkup).toContain('View event for match against Malcolm Henstock');
  });

  it('keeps the source action available when the opponent profile is unavailable', () => {
    const markup = renderList(false, matchFixture('missing-opponent', { opponent_id: null }));

    expect(markup).toContain('View fixture for match against Malcolm Henstock');
    expect(markup).not.toContain('Open Malcolm Henstock profile');
  });
});
