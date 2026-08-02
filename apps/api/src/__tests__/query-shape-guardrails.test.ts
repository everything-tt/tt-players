import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

async function readRoute(name: string): Promise<string> {
  return readFile(new URL(`../routes/${name}.ts`, import.meta.url), 'utf8');
}

describe('expensive query guardrails', () => {
  it('selects recent team fixtures before joining rubbers for form', async () => {
    const source = await readRoute('teams');
    const routeStart = source.indexOf("'/:id/form'");
    const route = source.slice(routeStart);
    const recentFixtures = route.indexOf('WITH recent_fixtures AS MATERIALIZED');
    const limit = route.indexOf('LIMIT 10', recentFixtures);
    const rubberJoin = route.indexOf('JOIN rubbers', recentFixtures);

    expect(routeStart).toBeGreaterThan(-1);
    expect(recentFixtures).toBeGreaterThan(-1);
    expect(limit).toBeGreaterThan(recentFixtures);
    expect(rubberJoin).toBeGreaterThan(limit);
  });

  it('filters league overview competitions before aggregate summaries', async () => {
    const source = await readRoute('leagues');
    const routeStart = source.indexOf("'/overview'");
    const routeEnd = source.indexOf("'/dashboard'", routeStart);
    const route = source.slice(routeStart, routeEnd);
    const selected = route.indexOf('selected_competitions AS MATERIALIZED');
    const standings = route.indexOf('standing_summary AS', selected);
    const upcoming = route.indexOf('upcoming_summary AS', standings);

    expect(routeStart).toBeGreaterThan(-1);
    expect(selected).toBeGreaterThan(-1);
    expect(standings).toBeGreaterThan(selected);
    expect(upcoming).toBeGreaterThan(standings);
  });

  it('reuses one materialized player appearance relation for league snapshot totals', async () => {
    const source = await readRoute('leagues');
    const routeStart = source.indexOf("'/:id/snapshot'");
    const route = source.slice(routeStart);

    expect(route).toContain('player_appearances AS MATERIALIZED');
    expect(route.match(/player_appearances AS MATERIALIZED/g)).toHaveLength(1);
    expect(route).not.toContain('const [snapshot, totalPlayerIds] = await Promise.all');
    expect(route).toContain('total_players');
  });
});
