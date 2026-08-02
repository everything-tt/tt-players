import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const routeSource = readFileSync(
  new URL('../routes/player-rivals.ts', import.meta.url),
  'utf8',
);

describe('player rivals query shape', () => {
  it('aggregates, ranks and bounds rival rows inside PostgreSQL', () => {
    expect(routeSource).toContain('WITH relevant AS MATERIALIZED');
    expect(routeSource).toMatch(/ROW_NUMBER\(\) OVER \(\s*PARTITION BY opponent_id/);
    expect(routeSource).toContain('COUNT(*) OVER (PARTITION BY opponent_id)');
    expect(routeSource).toContain('FILTER (WHERE sequence_number <= split_at)');
    expect(routeSource).toContain('WHERE toughest_rank <= 4');
    expect(routeSource).toContain('WHERE easiest_rank <= 4');
    expect(routeSource).toContain('WHERE improvement_rank <= 4');
    expect(routeSource).not.toContain('rankPlayerRivals');
    expect(routeSource).not.toContain('encounterRows.rows.map');
  });

  it('uses a source-versioned cache before running the ranked query', () => {
    expect(routeSource).toContain("const PLAYER_RIVALS_CACHE_TYPE = 'player-rivals-v2'");
    expect(routeSource).toContain(".select(['content', 'source_version', 'expires_at'])");
    expect(routeSource).toContain('const cached = await readRivalsCache');
    expect(routeSource.indexOf('const cached = await readRivalsCache'))
      .toBeLessThan(routeSource.indexOf('const result = await sql<RivalQueryRow>'));
  });
});
