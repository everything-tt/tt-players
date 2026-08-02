import { readFileSync } from 'node:fs';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MatchRecordRow } from './ui/appkit';

function renderScore(value: string, outcome: 'win' | 'loss' | 'neutral', ariaLabel: string) {
  return renderToStaticMarkup(
    <MatchRecordRow
      score={{ value, outcome, ariaLabel }}
      title="Lucy Elliott"
      metadata={['County Championships Junior', '11 Apr 2026']}
    />,
  );
}

describe('MatchRecordRow', () => {
  it('renders a detailed score with semantic outcome and accessible label', () => {
    const markup = renderScore('3–1', 'win', 'Won 3 games to 1');

    expect(markup).toContain('tt-match-record-row');
    expect(markup).toContain('tt-match-record-score--win');
    expect(markup).toContain('3–1');
    expect(markup).toContain('Won 3 games to 1');
    expect(markup).toContain('Lucy Elliott');
    expect(markup).toContain('County Championships Junior');
    expect(markup).toContain('11 Apr 2026');
  });

  it('renders a two-digit team score as one complete value', () => {
    const markup = renderScore('15–13', 'neutral', 'Home 15, Away 13');

    expect(markup).toContain('15–13');
    expect(markup).toContain('Home 15, Away 13');
  });

  it.each([
    ['W', 'win', 'Won, detailed score unavailable'],
    ['L', 'loss', 'Lost, detailed score unavailable'],
    ['D', 'neutral', 'Drawn, detailed score unavailable'],
    ['—', 'neutral', 'Result unavailable'],
  ] as const)('renders %s outcome-only and unknown score states', (value, outcome, ariaLabel) => {
    const markup = renderScore(value, outcome, ariaLabel);

    expect(markup).toContain(`tt-match-record-score--${outcome}`);
    expect(markup).toContain(value);
    expect(markup).toContain(ariaLabel);
  });

  it('renders up to two labelled direct actions', () => {
    const markup = renderToStaticMarkup(
      <MatchRecordRow
        score={{ value: '3–1', outcome: 'win', ariaLabel: 'Won 3 games to 1' }}
        title="Lucy Elliott"
        metadata={['County Championships Junior', '11 Apr 2026']}
        onClick={() => undefined}
        actions={[
          { iconClassName: 'fa fa-pen', label: 'Quick Journal', onClick: () => undefined, tone: 'accent' },
          { iconClassName: 'fa fa-calendar', label: 'View fixture', onClick: () => undefined },
        ]}
      />,
    );

    expect(markup).toContain('Quick Journal');
    expect(markup).toContain('View fixture');
    expect(markup).toContain('tt-match-record-actions');
  });

  it('uses one wider, shorter badge for detailed and outcome-only scores', () => {
    const css = readFileSync(
      new URL('../../../packages/design-system/src/components/MatchRecordRow.css', import.meta.url),
      'utf8',
    );

    expect(css).toContain('flex: 0 0 64px;');
    expect(css).toContain('height: 40px;');
    expect(css).toContain('min-height: 40px;');
    expect(css).toContain('width: 64px;');
    expect(css).toContain('white-space: nowrap;');
    expect(css).toContain('border-radius: var(--radius-sm);');
    expect(css).not.toContain('.tt-match-record-row--standard .tt-match-record-score');
  });
});
