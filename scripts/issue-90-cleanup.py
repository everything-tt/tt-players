from pathlib import Path
from subprocess import check_output
from textwrap import dedent, indent

PLAYERS_PATH = Path('apps/api/src/routes/players.ts')
PAGINATION_TEST_PATH = Path('apps/api/src/__tests__/search-pagination.integration.test.ts')
SHAPE_TEST_PATH = Path('apps/api/src/__tests__/player-search-query-shape.test.ts')


def render_return(expression: str, base_indent: str) -> str:
    rendered = indent(expression, base_indent).splitlines()
    rendered[0] = f'{base_indent}return {rendered[0].lstrip()}'
    rendered[-1] += ';'
    return '\n'.join(rendered)


original_players = check_output(
    ['git', 'show', 'origin/main:apps/api/src/routes/players.ts'],
    text=True,
)
route_marker = "        app.get(\n            '/search',"
original_route_start = original_players.index(route_marker)
original_query_start = original_players.index(
    '                const result = await sql<{',
    original_route_start,
)
original_data_start = original_players.index(
    '\n                const data = result.rows.map',
    original_query_start,
)
original_block = original_players[original_query_start:original_data_start].rstrip()
legacy_prefix = '                const result = await '
assert original_block.startswith(legacy_prefix)
legacy_expression = dedent(original_block[len(legacy_prefix):])
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

players = PLAYERS_PATH.read_text()
current_start = players.index(
    '                // The active global name-search path pages candidates before touching rubbers.'
)
current_data_start = players.index(
    '\n                const data = result.rows.map',
    current_start,
)
replacement = '\n'.join([
    '                // The active global name-search path pages candidates before touching rubbers.',
    '                // Legacy blank/saved/league requests retain their existing ordering semantics below.',
    '                const executeSearch = () => {',
    '                    if (normalizedQuery.length > 0 && leagueIds.length === 0) {',
    render_return(optimized_expression, '                        '),
    '                    }',
    '',
    render_return(legacy_expression, '                    '),
    '                };',
    '',
    '                const result = await executeSearch();',
])
players = players[:current_start] + replacement + players[current_data_start:]
PLAYERS_PATH.write_text(players)

pagination_tests = PAGINATION_TEST_PATH.read_text()
common_start = pagination_tests.index(
    "it('pages a common-name search without changing totals or stable ordering'"
)
common_end = pagination_tests.index('\n});', common_start) + len('\n});')
clean_common_test = dedent("""\
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
      Array.from(
        { length: 10 },
        (_, index) => `Green Search ${String(index + 1).padStart(2, '0')}`,
      ),
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
      Array.from(
        { length: 5 },
        (_, index) => `Green Search ${String(index + 11).padStart(2, '0')}`,
      ),
    );
  });""")
clean_common_test = indent(clean_common_test, '  ')[2:]
pagination_tests = (
    pagination_tests[:common_start]
    + clean_common_test
    + pagination_tests[common_end:]
)
pagination_tests = pagination_tests.replace('\n\n\n});\n\ndescribe(\'paginated tournament search\'', '\n\n});\n\ndescribe(\'paginated tournament search\'')
PAGINATION_TEST_PATH.write_text(pagination_tests)

SHAPE_TEST_PATH.write_text(dedent("""\
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
"""))

print('Cleaned issue 90 implementation formatting.')
