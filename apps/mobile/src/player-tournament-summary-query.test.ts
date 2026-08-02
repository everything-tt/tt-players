import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { buildPlayerTournamentSummariesPath } from './queries';

describe('player tournament summary query', () => {
  it('builds a bounded summary endpoint path', () => {
    expect(buildPlayerTournamentSummariesPath('player/id', 5))
      .toBe('/players/player%2Fid/tournament-summaries?limit=5');
  });

  it('is lazy on the profile until the tournaments panel is selected', async () => {
    const source = await readFile(new URL('./PlayerPage.tsx', import.meta.url), 'utf8');

    expect(source).toMatch(
      /usePlayerTournamentSummariesQuery\([\s\S]*?seasonPanelMode === 'tournaments',[\s\S]*?\);/,
    );
    expect(source).not.toContain('usePlayerTournamentsQuery');
  });
});
