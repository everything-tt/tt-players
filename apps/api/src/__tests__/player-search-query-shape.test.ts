import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('player search query shape', () => {
  it('pages global name matches before aggregating their rubbers', async () => {
    const source = await readFile(new URL('../routes/players.ts', import.meta.url), 'utf8');
    const optimizedStart = source.indexOf(
      'if (normalizedQuery.length > 0 && leagueIds.length === 0)',
    );
    const pagedPlayers = source.indexOf('paged_players AS MATERIALIZED', optimizedStart);
    const sourcePlayers = source.indexOf('source_players AS MATERIALIZED', pagedPlayers);
    const playerMatches = source.indexOf('player_matches AS', sourcePlayers);
    const playerStats = source.indexOf('player_stats AS', playerMatches);
    const matchAggregation = source.slice(playerMatches, playerStats);

    expect(optimizedStart).toBeGreaterThan(-1);
    expect(pagedPlayers).toBeGreaterThan(optimizedStart);
    expect(sourcePlayers).toBeGreaterThan(pagedPlayers);
    expect(playerMatches).toBeGreaterThan(sourcePlayers);
    expect(matchAggregation.match(/FROM source_players sp/g)).toHaveLength(2);
    expect(matchAggregation).not.toContain('JOIN external_players ep');
  });
});
