import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./EventDetailPage.tsx', import.meta.url), 'utf8');

describe('tournament selected-player filter', () => {
  it('replaces player browsing controls with one selected-player row', () => {
    expect(source).toContain('selectedPlayer ? (\n                      <DesignList density="compact" divider="hairline" paginate={false}>');
    expect(source).toContain('title={selectedPlayer.name}');
    expect(source).toContain('subtitle="Filtering recorded matches"');
    expect(source).toContain('Clear player');
    expect(source).toContain(') : (\n                      <>\n                        <AppSearchInput');
  });
});
