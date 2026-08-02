import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('My TT identity behaviour', () => {
  it('shows identity selection only before an identity exists and exposes Unfollow', () => {
    const source = read('./MyTTSection.tsx');
    expect(source).toContain('!myPlayer');
    expect(source).toContain('Unfollow');
    expect(source).toContain('remove(player.id)');
  });

  it('clears identity only from the identified player profile', () => {
    const pageSource = read('../PlayerPage.tsx');
    const heroSource = read('./PlayerProfileHero.tsx');

    expect(pageSource).toContain('isMyPlayer(playerId)');
    expect(pageSource).toContain('clearMyPlayer');
    expect(pageSource).toContain('onClearIdentity={clearMyPlayer}');
    expect(heroSource).toContain('isCurrentUser ?');
    expect(heroSource).toContain('This isn’t me');
  });

  it('prefills the existing journal form from validated query parameters', () => {
    const source = read('../MatchJournalPage.tsx');
    expect(source).toContain('useSearchParams');
    expect(source).toContain('readJournalPrefill');
    expect(source).not.toContain('add(prefill');
  });
});