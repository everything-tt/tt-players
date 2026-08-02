import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (relativePath: string) => readFileSync(new URL(relativePath, import.meta.url), 'utf8');

describe('unified player profile hero', () => {
  it('moves profile identity, rating and form into one focused component', () => {
    const pageSource = read('../PlayerPage.tsx');
    const heroSource = read('./PlayerProfileHero.tsx');

    expect(pageSource).toContain("import { PlayerProfileHero } from './components/PlayerProfileHero';");
    expect(pageSource).toContain('<PlayerProfileHero');
    expect(pageSource).not.toContain('<PlayerRatingPanel');
    expect(pageSource).not.toContain('id="tt-player-form-title"');

    expect(heroSource).toContain('Player profile');
    expect(heroSource).toContain('Ability rating');
    expect(heroSource).toContain('Global rank');
    expect(heroSource).toContain('Confidence');
    expect(heroSource).toContain('Likely range');
    expect(heroSource).toContain('Win rate');
    expect(heroSource).toContain('Rolling 10');
    expect(heroSource).toContain('Rolling 20');
    expect(heroSource).toContain('Momentum');
  });

  it('replaces follow with identity removal for the identified player', () => {
    const heroSource = read('./PlayerProfileHero.tsx');

    expect(heroSource).toContain('isCurrentUser ?');
    expect(heroSource).toContain('This isn’t me');
    expect(heroSource).toContain('<FavouriteButton');
    expect(heroSource).toContain(': (');
  });

  it('matches the approved compact mock at narrow mobile widths', () => {
    const heroSource = read('./PlayerProfileHero.tsx');
    const styles = read('../player-profile-hero.css');

    expect(heroSource.indexOf('tt-player-profile-eyebrow')).toBeLessThan(heroSource.indexOf('tt-player-profile-identity'));
    expect(heroSource).toContain('View History');
    expect(heroSource).toContain('tt-player-profile-form-indicator');
    expect(heroSource).toContain('Rolling win rate form indicator');
    expect(heroSource).not.toContain('<FormResultPills');

    expect(styles).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(styles).not.toContain('.tt-player-profile-actions {\n    grid-template-columns: 1fr;');
    expect(styles).toContain('.tt-player-profile-form-indicator');
    expect(styles).toContain('.tt-player-profile-action-label');
  });

  it('keeps all approved hero actions and scoped raised-card styling', () => {
    const heroSource = read('./PlayerProfileHero.tsx');
    const styles = read('../player-profile-hero.css');

    expect(heroSource).toContain('Share');
    expect(heroSource).toContain('View History');
    expect(heroSource).toContain('Insights');
    expect(styles).toContain('.tt-player-profile-hero');
    expect(styles).toContain('box-shadow');
    expect(styles).toContain('.tt-player-profile-form-grid');
  });
});
