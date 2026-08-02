import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync(new URL('./h2h-ui.css', import.meta.url), 'utf8');

function rule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('H2H selection layout', () => {
  it('centres the select-player action within each card while keeping the player label left aligned', () => {
    const select = rule('.tt-h2h-player-card__select');
    const label = rule('.tt-h2h-player-card__label');
    const empty = rule('.tt-h2h-player-card__empty');

    expect(select).toContain('display: grid;');
    expect(select).toContain('grid-template-rows: auto minmax(0, 1fr);');
    expect(select).toContain('padding-inline: var(--tt-space-6);');
    expect(select).toContain('width: 100%;');
    expect(label).toContain('justify-self: start;');
    expect(empty).toContain('align-self: stretch;');
    expect(empty).toContain('justify-self: stretch;');
    expect(empty).toContain('text-align: center;');
    expect(empty).toContain('width: 100%;');
  });

  it('adds page-specific breathing room before saved matchups', () => {
    const savedSection = rule('.tt-h2h-page > .tt-section--emphasis-primary + .tt-section--emphasis-secondary');

    expect(savedSection).toContain(
      'margin-top: calc(var(--tt-section-gap-flat) + var(--tt-space-2)) !important;',
    );
  });
});
