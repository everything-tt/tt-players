import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8');

describe('app-wide design-system completion', () => {
  it('uses canonical shell primitives at the tab root', () => {
    const source = read('./App.tsx');

    expect(source).toContain('AppShellPage');
    expect(source).toContain('AppPageContent');
    expect(source).not.toContain('<div id="page" className="app-shell-page">');
    expect(source).not.toContain('<main className="page-content app-shell-content');
  });

  it('uses canonical player profile compositions', () => {
    const source = read('./PlayerPage.tsx');

    expect(source).toContain('<EntityHero');
    expect(source).toContain('<MetricGrid');
    expect(source).toContain('<PageSection');
    expect(source).toContain('<DesignList');
    expect(source).not.toMatch(/<section\b[^>]*tt-player-(?:hero|section)/);
    expect(source).not.toContain('tt-player-section-state');
    expect(source).not.toMatch(/<List\b/);
  });

  it('uses PageSection for shared section skeletons', () => {
    const source = read('./components/Skeleton.tsx');

    expect(source).toContain('<PageSection');
    expect(source).not.toContain('tt-player-section');
  });

  it('has no legacy section-wrapper allowlist', () => {
    const source = read('../../../scripts/check-design-system-usage.mjs');

    expect(source).toContain('const legacySectionAllowlist = new Set([]);');
    expect(source).toContain('const inlineGeometryAllowlist = new Set([]);');
  });

  it('overrides semantic text tokens in dark mode', () => {
    const source = read('../../../packages/design-system/src/styles/tokens.css');
    const darkTheme = source.match(/body\.theme-dark\s*\{(?<body>[\s\S]*?)\}/)?.groups?.body ?? '';

    expect(darkTheme).toContain('--tt-text-primary:');
    expect(darkTheme).toContain('--tt-text-muted:');
  });
});
