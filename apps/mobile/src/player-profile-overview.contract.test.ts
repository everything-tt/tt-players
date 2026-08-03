import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

describe('player profile overview request consolidation', () => {
  it('loads the profile header and clubs from one overview query', () => {
    const page = source('./PlayerPage.tsx');

    expect(page).toContain('usePlayerProfileOverviewQuery');
    expect(page).not.toContain('usePlayerExtendedStatsQuery');
    expect(page).not.toContain('usePlayerCurrentSeasonAffiliationsQuery');
    expect(page).not.toContain('usePlayerInsightsQuery');
  });

  it('keeps full insights available only on the dedicated insights page', () => {
    expect(source('./PlayerInsightsPage.tsx')).toContain('usePlayerInsightsQuery');
  });
});
