from pathlib import Path
from textwrap import dedent

PLAYERS_PATH = Path('apps/api/src/routes/players.ts')
PAGINATION_TEST_PATH = Path('apps/api/src/__tests__/search-pagination.integration.test.ts')
SHAPE_TEST_PATH = Path('apps/api/src/__tests__/player-search-query-shape.test.ts')
PLAN_PATH = Path('docs/superpowers/plans/2026-08-02-player-search-page-first-stats.md')


def indent_expression(expression: str, first_prefix: str, rest_prefix: str) -> str:
    lines = expression.splitlines()
    return first_prefix + lines[0] + '\n' + '\n'.join(rest_prefix + line for line in lines[1:])


players = PLAYERS_PATH.read_text()
route_marker = "        app.get(\n            '/search',"
route_start = players.index(route_marker)
query_start = players.index('                const result = await sql<{', route_start)
data_start = players.index('\n                const data = result.rows.map', query_start)
old_block = players[query_start:data_start].rstrip()
legacy_prefix = '                const result = await '
assert old_block.startswith(legacy_prefix)
legacy_expression = old_block[len(legacy_prefix):]
assert legacy_expression.endswith(';')
legacy_expression = legacy_expression[:-1]

optimized_expression = dedent("""\
sql<{
    id: string;
    name: string;
    played: number | string;
    wins: number | string;
    total: number | string;
}>`
    WITH matching_players AS (
        SELECT cp.id, cp.name
        FROM external_players ep
        JOIN external_players cp ON cp.id = COALESCE(ep.canonical_player_id, ep.id)
        WHERE ep.deleted_at IS NULL
          AND cp.deleted_at IS NULL
          AND ep.name ILIKE ${searchPattern}
          AND (${savedIds.length} = 0 OR cp.id = ANY(${savedIdArray}))
        GROUP BY cp.id, cp.name
    ),
    paged_players AS MATERIALIZED (
        SELECT id, name, COUNT(*) OVER()::int AS total
        FROM matching_players
        ORDER BY name ASC, id ASC
        LIMIT ${limit}
        OFFSET ${offset}
    ),
    source_players AS MATERIALIZED (
        SELECT
            pp.id AS player_id,
            ep.id AS source_player_id
        FROM paged_players pp
        JOIN external_players ep
          ON COALESCE(ep.canonical_player_id, ep.id) = pp.id
        WHERE ep.deleted_at IS NULL
    ),
    player_matches AS (
        SELECT
            sp.player_id,
            CASE WHEN r.home_games_won > r.away_games_won THEN 1 ELSE 0 END AS win
        FROM source_players sp
        JOIN rubbers r ON r.home_player_1_id = sp.source_player_id
        JOIN fixtures f ON f.id = r.fixture_id
        JOIN competitions c ON c.id = f.competition_id
        JOIN seasons s ON s.id = c.season_id
        WHERE r.is_doubles = false
          AND r.deleted_at IS NULL
          AND r.outcome_type != 'walkover'
          AND r.home_player_1_id IS NOT NULL
          AND f.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND s.deleted_at IS NULL

        UNION ALL

        SELECT
            sp.player_id,
            CASE WHEN r.away_games_won > r.home_games_won THEN 1 ELSE 0 END AS win
        FROM source_players sp
        JOIN rubbers r ON r.away_player_1_id = sp.source_player_id
        JOIN fixtures f ON f.id = r.fixture_id
        JOIN competitions c ON c.id = f.competition_id
        JOIN seasons s ON s.id = c.season_id
        WHERE r.is_doubles = false
          AND r.deleted_at IS NULL
          AND r.outcome_type != 'walkover'
          AND r.away_player_1_id IS NOT NULL
          AND f.deleted_at IS NULL
          AND c.deleted_at IS NULL
          AND s.deleted_at IS NULL
    ),
    player_stats AS (
        SELECT
            player_id,
            COUNT(*)::int AS played,
            COALESCE(SUM(win), 0)::int AS wins
        FROM player_matches
        GROUP BY player_id
    )
    SELECT
        pp.id,
        pp.name,
        COALESCE(ps.played, 0)::int AS played,
        COALESCE(ps.wins, 0)::int AS wins,
        pp.total
    FROM paged_players pp
    LEFT JOIN player_stats ps ON ps.player_id = pp.id
    ORDER BY pp.name ASC, pp.id ASC
`.execute(db)""")

replacement = '\n'.join([
    '                // The active global name-search path pages candidates before touching rubbers.',
    '                // Legacy blank/saved/league requests retain their existing ordering semantics below.',
    '                const result = normalizedQuery.length > 0 && leagueIds.length === 0',
    indent_expression(optimized_expression, '                    ? await ', '                      '),
    indent_expression(legacy_expression, '                    : await ', '                      ') + ';',
])
players = players[:query_start] + replacement + players[data_start:]
PLAYERS_PATH.write_text(players)

pagination_tests = PAGINATION_TEST_PATH.read_text()
common_name_test = dedent("""

  it('pages a common-name search without changing totals or stable ordering', async () => {
    await db.insertInto('external_players').values(
      Array.from({ length: 15 }, (_, index) => ({
        platform_id: ids.platformId,
        external_id: `green-search-${index + 1}`,
        name: `Green Search ${String(index + 1).padStart(2, '0')}`,
        updated_at: new Date(),
      })),
    ).execute();

    const first = await request
      .get('/api/players/search?q=Green%20Search&limit=10&offset=0')
      .expect(200);

    expect(first.body).toMatchObject({
      total: 15,
      limit: 10,
      offset: 0,
      has_more: true,
    });
    expect(first.body.data.map((row: { name: string }) => row.name)).toEqual(
      Array.from({ length: 10 }, (_, index) => `Green Search ${String(index + 1).padStart(2, '0')}`),
    );

    const second = await request
      .get('/api/players/search?q=Green%20Search&limit=10&offset=10')
      .expect(200);

    expect(second.body).toMatchObject({
      total: 15,
      limit: 10,
      offset: 10,
      has_more: false,
    });
    expect(second.body.data.map((row: { name: string }) => row.name)).toEqual(
      Array.from({ length: 5 }, (_, index) => `Green Search ${String(index + 11).padStart(2, '0')}`),
    );
  });
""")
if "pages a common-name search" not in pagination_tests:
    tournament_marker = "\n});\n\ndescribe('paginated tournament search'"
    insertion = pagination_tests.index(tournament_marker)
    pagination_tests = pagination_tests[:insertion] + common_name_test + pagination_tests[insertion:]
    PAGINATION_TEST_PATH.write_text(pagination_tests)

SHAPE_TEST_PATH.write_text(dedent("""\
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';

describe('player search query shape', () => {
  it('pages global name matches before aggregating their rubbers', async () => {
    const source = await readFile(new URL('../routes/players.ts', import.meta.url), 'utf8');
    const optimizedStart = source.indexOf(
      'const result = normalizedQuery.length > 0 && leagueIds.length === 0',
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
"""))

PLAN_PATH.parent.mkdir(parents=True, exist_ok=True)
PLAN_PATH.write_text(dedent("""\
# Player Search Page-First Stats Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prevent global name searches from aggregating every eligible rubber before pagination.

**Architecture:** Keep the existing legacy query for blank, saved-only, and league-scoped requests. For the active global name-search path, resolve canonical matches, count and page them in stable name/id order, expand only that page to source-player IDs, and aggregate wins/played through the existing partial rubber indexes.

**Tech Stack:** Fastify, TypeScript, Kysely raw SQL, PostgreSQL, Vitest, Supertest.

## Global Constraints

- Preserve the response envelope and stable `name`, `id` pagination order.
- Preserve canonical-player and alias matching semantics.
- Preserve displayed all-time singles `wins` and `played` counts, excluding walkovers and deleted records.
- Do not add a database migration unless the revised production plan demonstrates a missing index.
- The current Players UI performs global search and does not expose league filtering.

---

### Task 1: Add a query-shape regression test

**Files:**
- Create: `apps/api/src/__tests__/player-search-query-shape.test.ts`

- [x] Add a focused test that requires paged and source-player CTEs to precede rubber aggregation.
- [x] Require both home and away branches to start from the paged source-player set.

### Task 2: Page global name matches before match aggregation

**Files:**
- Modify: `apps/api/src/routes/players.ts`

- [x] Select matching canonical players by name and optional saved IDs.
- [x] Apply `COUNT(*) OVER()`, stable ordering, `LIMIT`, and `OFFSET` before joining rubbers.
- [x] Expand only paged canonical IDs to active source-player IDs.
- [x] Aggregate home and away singles through the existing player/fixture partial indexes.
- [x] Retain the legacy query for paths whose ordering depends on activity or legacy league scope.

### Task 3: Cover common-name pagination

**Files:**
- Modify: `apps/api/src/__tests__/search-pagination.integration.test.ts`

- [x] Add 15 deterministic `Green Search` players.
- [x] Verify first and second pages, total, stable ordering, and `has_more`.

### Task 4: Verify and publish

- [ ] Run API TypeScript build.
- [ ] Run the query-shape test.
- [ ] Let normal PR CI run the PostgreSQL integration suite.
- [ ] Review the final diff for issue #90 scope only.
"""))

print('Patched player search, tests, and implementation plan.')
