import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./LeagueSelectionPage.tsx', import.meta.url), 'utf8');
const css = readFileSync(new URL('./native-mobile.css', import.meta.url), 'utf8');

function cssRule(selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`));
  expect(match, `Missing CSS rule for ${selector}`).not.toBeNull();
  return match?.[1] ?? '';
}

describe('LeagueSelectionPage full-page scope experience', () => {
  it('uses the shared page presentation with clear hierarchy and one completion action', () => {
    expect(source).toContain('presentation="page"');
    expect(source).toContain('title="League scope"');
    expect(source).toContain('Choose the leagues and areas included across Players, Leagues and Home.');
    expect(source).toContain('className="tt-league-scope"');
    expect(source).toContain('className="tt-league-scope__footer"');
    expect(source).toContain('>Done<');
    expect(source).not.toContain('height="72%"');
    expect(source).not.toContain('eyebrow="League Scope"');
  });

  it('keeps multi-character input local while deferring only derived filtering', () => {
    expect(source).toContain("import { useDeferredValue,");
    expect(source).toContain('const [query, setQuery] = useState(\'\');');
    expect(source).toContain('const deferredQuery = useDeferredValue(query);');
    expect(source).toContain('value={query}');
    expect(source).toContain('onChange={(event) => setQuery(event.currentTarget.value)}');
    expect(source).not.toContain("setActiveTab(v); setQuery('');");
  });

  it('supports browsing without a query and searches league metadata', () => {
    expect(source).toContain('const filteredLeagues = useMemo');
    expect(source).toContain('if (!normalizedQuery) return orderedLeagues;');
    expect(source).toContain('leagueSearchText(league)');
    expect(source).not.toContain("title=\"Search leagues\"");
  });

  it('uses the design-system list density without page-specific row styling', () => {
    expect(source).toContain('DesignList,');
    expect(source.match(/<DesignList density="compact" divider="hairline">/g)).toHaveLength(3);
    expect(source).not.toContain('<List className="tt-league-scope__list"');
    expect(css).not.toContain('.tt-league-scope__list');
  });

  it('keeps page controls and completion action visible around a scrollable body', () => {
    const page = cssRule('.tt-sheet--page');
    const controls = cssRule('.tt-league-scope__controls');
    const footer = cssRule('.tt-league-scope__footer');

    expect(page).toContain('height: 100dvh;');
    expect(page).toContain('max-height: 100dvh;');
    expect(controls).toContain('position: sticky;');
    expect(controls).toContain('top: 0;');
    expect(footer).toContain('align-items: center;');
    expect(footer).toContain('display: flex;');
  });
});
