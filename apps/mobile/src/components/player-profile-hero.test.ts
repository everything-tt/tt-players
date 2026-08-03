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

  it('presents a self-claimed profile as quiet account state, not a mismatch action', () => {
    const heroSource = read('./PlayerProfileHero.tsx');

    expect(heroSource).toContain('isCurrentUser ?');
    expect(heroSource).toContain('Claimed as your profile');
    expect(heroSource).toContain('Undo claim');
    expect(heroSource).toContain('Undo this profile claim?');
    expect(heroSource).toContain('No match data will be deleted.');
    expect(heroSource).not.toContain('This isn’t me');
    expect(heroSource).toContain('<FavouriteButton');
  });

  it('puts identity copy before the right-aligned avatar', () => {
    const heroSource = read('./PlayerProfileHero.tsx');
    const styles = read('../player-profile-hero.css');

    expect(heroSource.indexOf('tt-player-profile-copy')).toBeLessThan(heroSource.indexOf('tt-player-profile-avatar'));
    expect(styles).toContain('.tt-player-profile-avatar {');
    expect(styles).toContain('margin-left: auto;');
  });

  it('matches the approved compact action and summary hierarchy at narrow mobile widths', () => {
    const heroSource = read('./PlayerProfileHero.tsx');
    const styles = read('../player-profile-hero.css');

    expect(heroSource.indexOf('tt-player-profile-eyebrow')).toBeLessThan(heroSource.indexOf('tt-player-profile-identity'));
    expect(heroSource).toContain('>History</span>');
    expect(heroSource).toContain('tt-player-profile-form-indicator');
    expect(heroSource).toContain('Rolling win rate form indicator');
    expect(heroSource).not.toContain('<FormResultPills');

    expect(styles).toContain('grid-template-columns: repeat(4, minmax(0, 1fr));');
    expect(styles).toContain('.tt-player-profile-actions--claimed');
    expect(styles).toContain('grid-template-columns: repeat(3, minmax(0, 1fr));');
    expect(styles).toContain('.tt-player-profile-form-indicator');
    expect(styles).toContain('.tt-player-profile-action-label');
  });

  it('keeps all approved hero actions and scoped raised-card styling', () => {
    const heroSource = read('./PlayerProfileHero.tsx');
    const styles = read('../player-profile-hero.css');

    expect(heroSource).toContain('Share');
    expect(heroSource).toContain('History');
    expect(heroSource).toContain('Insights');
    expect(heroSource).toContain('tt-player-profile-claim');
    expect(styles).toContain('.tt-player-profile-hero');
    expect(styles).toContain('box-shadow');
    expect(styles).toContain('.tt-player-profile-form-grid');
  });
});
