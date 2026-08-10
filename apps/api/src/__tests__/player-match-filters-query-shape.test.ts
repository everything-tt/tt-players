import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function routeSource(): Promise<string> {
  return readFile(new URL('../routes/player-match-filters.ts', import.meta.url), 'utf8');
}

describe('player match filter query shape', () => {
  it('requires one exact team or event filter', async () => {
    const source = await routeSource();

    expect(source).toContain("team_id: z.string().uuid().optional()");
    expect(source).toContain("event_id: z.string().uuid().optional()");
    expect(source).toContain('Boolean(value.team_id) !== Boolean(value.event_id)');
  });

  it('matches a team on the same fixture side as the player', async () => {
    const source = await routeSource();

    expect(source).toContain('r.home_player_1_id = ANY(${sourceIds}) AND f.home_team_id = ${selectedTeamId}::uuid');
    expect(source).toContain('r.away_player_1_id = ANY(${sourceIds}) AND f.away_team_id = ${selectedTeamId}::uuid');
    expect(source).toContain("c.type <> 'individual'");
  });

  it('filters tournaments by exact event id before limit and offset', async () => {
    const source = await routeSource();
    const eventFilter = source.indexOf('c.id = ${selectedEventId}::uuid');
    const cteEnd = source.indexOf(')\n                `;', eventFilter);
    const limit = source.indexOf('LIMIT ${limit}', cteEnd);
    const count = source.indexOf('SELECT COUNT(*)::int as count', cteEnd);

    expect(eventFilter).toBeGreaterThan(-1);
    expect(cteEnd).toBeGreaterThan(eventFilter);
    expect(limit).toBeGreaterThan(cteEnd);
    expect(count).toBeGreaterThan(cteEnd);
  });
});
