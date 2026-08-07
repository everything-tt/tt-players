import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const source = readFileSync(new URL('./EventDetailPage.tsx', import.meta.url), 'utf8');

describe('tournament selected-player filter', () => {
  it('replaces player browsing controls with one selected-player row featuring icon clear button', () => {
    expect(source).toContain('selectedPlayer ? (\n                      <DesignList density="compact" divider="hairline" paginate={false}>');
    expect(source).toContain('title={selectedPlayer.name}');
    expect(source).toContain('subtitle="Filtering recorded matches"');
    expect(source).toContain('aria-label="Clear player"');
    expect(source).toContain('<i className="fa fa-times-circle" aria-hidden="true" />');
    expect(source).toContain(') : (\n                      <>\n                        <AppSearchInput');
  });

  it('provides a H2H link action on match rows for the selected player', () => {
    expect(source).toContain('const hasH2HLink = Boolean(');
    expect(source).toContain('iconClassName: \'fa fa-code-compare\'');
    expect(source).toContain('navigate(`/h2h/${match.home_player_resolved_id}/${match.away_player_resolved_id}`)');
  });

  it('removes enter online button when the competition is completed', () => {
    expect(source).toContain('event.entry_url && event.status !== \'completed\'');
  });
});

