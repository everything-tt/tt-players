import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('player search query shape', () => {
  it('expands paged canonical players through the indexed canonical id', async () => {
    const source = await readFile(new URL('../routes/players.ts', import.meta.url), 'utf8');
    const pagedPlayers = source.indexOf('paged_players AS MATERIALIZED');
    const sourcePlayers = source.indexOf('source_players AS MATERIALIZED', pagedPlayers);
    const playerMatches = source.indexOf('player_matches AS', sourcePlayers);
    const playerStats = source.indexOf('player_stats AS', playerMatches);
    const sourceExpansion = source.slice(sourcePlayers, playerMatches);
    const matchAggregation = source.slice(playerMatches, playerStats);

    expect(pagedPlayers).toBeGreaterThan(-1);
    expect(sourcePlayers).toBeGreaterThan(pagedPlayers);
    expect(playerMatches).toBeGreaterThan(sourcePlayers);
    expect(sourceExpansion).toContain('ON ep.canonical_player_id = pp.id');
    expect(sourceExpansion).not.toContain('COALESCE(ep.canonical_player_id, ep.id) = pp.id');
    expect(matchAggregation.match(/FROM source_players sp/g)).toHaveLength(2);
    expect(matchAggregation).not.toContain('JOIN external_players ep');
  });

  it('starts blank recent browse from materialized scoped fixtures', async () => {
    const source = await readFile(new URL('../routes/players.ts', import.meta.url), 'utf8');
    const blankBrowse = source.indexOf('scoped_fixtures AS MATERIALIZED');
    const rubberJoin = source.indexOf('JOIN rubbers r ON r.fixture_id = sf.id', blankBrowse);

    expect(blankBrowse).toBeGreaterThan(-1);
    expect(rubberJoin).toBeGreaterThan(blankBrowse);
  });
});
