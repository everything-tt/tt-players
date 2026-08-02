from pathlib import Path


def replace_once(text: str, old: str, new: str, label: str) -> str:
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f'{label}: expected exactly one match, found {count}')
    return text.replace(old, new, 1)


teams_path = Path('apps/api/src/routes/teams.ts')
teams = teams_path.read_text()
old_team_form = '''                    sql<any>`
                        SELECT f.home_team_id, f.away_team_id,
                            SUM(CASE WHEN r.home_games_won > r.away_games_won THEN 1 ELSE 0 END) as home_score,
                            SUM(CASE WHEN r.away_games_won > r.home_games_won THEN 1 ELSE 0 END) as away_score
                        FROM fixtures f
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE (f.home_team_id = ${id} OR f.away_team_id = ${id})
                          AND f.status = 'completed'
                          AND r.deleted_at IS NULL
                        GROUP BY f.id, f.date_played, f.home_team_id, f.away_team_id
                        ORDER BY f.date_played DESC
                    `.execute(db),'''
new_team_form = '''                    sql<any>`
                        WITH recent_fixtures AS MATERIALIZED (
                            SELECT
                                f.id,
                                f.home_team_id,
                                f.away_team_id,
                                f.date_played
                            FROM fixtures f
                            WHERE (f.home_team_id = ${id} OR f.away_team_id = ${id})
                              AND f.status = 'completed'
                              AND f.deleted_at IS NULL
                            ORDER BY f.date_played DESC NULLS LAST, f.id DESC
                            LIMIT 10
                        )
                        SELECT
                            f.home_team_id,
                            f.away_team_id,
                            SUM(CASE WHEN r.home_games_won > r.away_games_won THEN 1 ELSE 0 END) AS home_score,
                            SUM(CASE WHEN r.away_games_won > r.home_games_won THEN 1 ELSE 0 END) AS away_score
                        FROM recent_fixtures f
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE r.deleted_at IS NULL
                        GROUP BY f.id, f.date_played, f.home_team_id, f.away_team_id
                        ORDER BY f.date_played DESC NULLS LAST, f.id DESC
                    `.execute(db),'''
teams = replace_once(teams, old_team_form, new_team_form, 'team form query')
teams_path.write_text(teams)


leagues_path = Path('apps/api/src/routes/leagues.ts')
leagues = leagues_path.read_text()
old_overview = '''                    WITH standing_summary AS (
                        SELECT
                            c.id AS competition_id,
                            COUNT(DISTINCT ls.team_id)::int AS teams,
                            COALESCE(ROUND(SUM(ls.played)::numeric / 2), 0)::int AS matches_played
                        FROM competitions c
                        LEFT JOIN league_standings ls
                          ON ls.competition_id = c.id
                         AND ls.deleted_at IS NULL
                        WHERE c.type = 'league'
                          AND c.deleted_at IS NULL
                        GROUP BY c.id
                    ),
                    upcoming_summary AS (
                        SELECT
                            f.competition_id,
                            COUNT(*)::int AS upcoming_fixtures
                        FROM fixtures f
                        WHERE f.status = 'upcoming'
                          AND f.deleted_at IS NULL
                        GROUP BY f.competition_id
                    )
                    SELECT
                        l.id,
                        l.name,
                        s.id AS season_id,
                        s.name AS season,
                        COUNT(DISTINCT c.id)::int AS divisions,
                        COALESCE(SUM(ss.teams), 0)::int AS teams,
                        COALESCE(SUM(ss.matches_played), 0)::int AS matches_played,
                        COALESCE(SUM(us.upcoming_fixtures), 0)::int AS upcoming_fixtures,
                        MAX(c.last_scraped_at) AS last_scraped_at
                    FROM leagues l
                    JOIN seasons s
                      ON s.league_id = l.id
                     AND s.is_active = true
                     AND s.deleted_at IS NULL
                    JOIN competitions c
                      ON c.season_id = s.id
                     AND c.type = 'league'
                     AND c.deleted_at IS NULL
                    LEFT JOIN standing_summary ss ON ss.competition_id = c.id
                    LEFT JOIN upcoming_summary us ON us.competition_id = c.id
                    WHERE l.deleted_at IS NULL
                      AND (${leagueIds.length} = 0 OR l.id = ANY(${sql`ARRAY[${sql.join(leagueIds.map((id) => sql`${id}::uuid`))}]::uuid[]`}))
                    GROUP BY l.id, l.name, s.id, s.name
                    ORDER BY l.name ASC'''
new_overview = '''                    WITH selected_competitions AS MATERIALIZED (
                        SELECT
                            c.id AS competition_id,
                            c.last_scraped_at,
                            l.id AS league_id,
                            l.name AS league_name,
                            s.id AS season_id,
                            s.name AS season_name
                        FROM leagues l
                        JOIN seasons s
                          ON s.league_id = l.id
                         AND s.is_active = true
                         AND s.deleted_at IS NULL
                        JOIN competitions c
                          ON c.season_id = s.id
                         AND c.type = 'league'
                         AND c.deleted_at IS NULL
                        WHERE l.deleted_at IS NULL
                          AND (${leagueIds.length} = 0 OR l.id = ANY(${sql`ARRAY[${sql.join(leagueIds.map((id) => sql`${id}::uuid`))}]::uuid[]`}))
                    ),
                    standing_summary AS (
                        SELECT
                            selected.competition_id,
                            COUNT(DISTINCT standings.team_id)::int AS teams,
                            COALESCE(ROUND(SUM(standings.played)::numeric / 2), 0)::int AS matches_played
                        FROM selected_competitions selected
                        LEFT JOIN league_standings standings
                          ON standings.competition_id = selected.competition_id
                         AND standings.deleted_at IS NULL
                        GROUP BY selected.competition_id
                    ),
                    upcoming_summary AS (
                        SELECT
                            selected.competition_id,
                            COUNT(fixtures.id)::int AS upcoming_fixtures
                        FROM selected_competitions selected
                        LEFT JOIN fixtures
                          ON fixtures.competition_id = selected.competition_id
                         AND fixtures.status = 'upcoming'
                         AND fixtures.deleted_at IS NULL
                        GROUP BY selected.competition_id
                    )
                    SELECT
                        selected.league_id AS id,
                        selected.league_name AS name,
                        selected.season_id,
                        selected.season_name AS season,
                        COUNT(selected.competition_id)::int AS divisions,
                        COALESCE(SUM(standing_summary.teams), 0)::int AS teams,
                        COALESCE(SUM(standing_summary.matches_played), 0)::int AS matches_played,
                        COALESCE(SUM(upcoming_summary.upcoming_fixtures), 0)::int AS upcoming_fixtures,
                        MAX(selected.last_scraped_at) AS last_scraped_at
                    FROM selected_competitions selected
                    LEFT JOIN standing_summary
                      ON standing_summary.competition_id = selected.competition_id
                    LEFT JOIN upcoming_summary
                      ON upcoming_summary.competition_id = selected.competition_id
                    GROUP BY selected.league_id, selected.league_name, selected.season_id, selected.season_name
                    ORDER BY selected.league_name ASC'''
leagues = replace_once(leagues, old_overview, new_overview, 'league overview query')

snapshot_start = leagues.index('                const [snapshot, totalPlayerIds] = await Promise.all([')
snapshot_end = leagues.index('\n                const divisions =', snapshot_start)
new_snapshot = '''                const snapshot = await sql<{
                    division_id: string;
                    division_name: string;
                    teams: number;
                    players: number;
                    matches: number;
                    total_players: number;
                }>`
                    WITH active_competitions AS MATERIALIZED (
                        SELECT c.id, c.name
                        FROM competitions c
                        JOIN seasons s ON s.id = c.season_id
                        WHERE s.league_id = ${id}
                          AND s.is_active = true
                          AND s.deleted_at IS NULL
                          AND c.type = 'league'
                          AND c.deleted_at IS NULL
                    ),
                    standing_counts AS (
                        SELECT
                            ls.competition_id,
                            COUNT(*)::int AS teams,
                            COALESCE(ROUND(SUM(ls.played)::numeric / 2), 0)::int AS matches
                        FROM league_standings ls
                        JOIN active_competitions ac ON ac.id = ls.competition_id
                        WHERE ls.deleted_at IS NULL
                        GROUP BY ls.competition_id
                    ),
                    player_appearances AS MATERIALIZED (
                        SELECT f.competition_id, r.home_player_1_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL
                          AND r.deleted_at IS NULL
                          AND r.home_player_1_id IS NOT NULL
                        UNION ALL
                        SELECT f.competition_id, r.home_player_2_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL
                          AND r.deleted_at IS NULL
                          AND r.home_player_2_id IS NOT NULL
                        UNION ALL
                        SELECT f.competition_id, r.away_player_1_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL
                          AND r.deleted_at IS NULL
                          AND r.away_player_1_id IS NOT NULL
                        UNION ALL
                        SELECT f.competition_id, r.away_player_2_id AS player_id
                        FROM fixtures f
                        JOIN active_competitions ac ON ac.id = f.competition_id
                        JOIN rubbers r ON r.fixture_id = f.id
                        WHERE f.deleted_at IS NULL
                          AND r.deleted_at IS NULL
                          AND r.away_player_2_id IS NOT NULL
                    ),
                    player_counts AS (
                        SELECT competition_id, COUNT(DISTINCT player_id)::int AS players
                        FROM player_appearances
                        GROUP BY competition_id
                    ),
                    total_players AS (
                        SELECT COUNT(DISTINCT player_id)::int AS players
                        FROM player_appearances
                    )
                    SELECT
                        ac.id AS division_id,
                        ac.name AS division_name,
                        COALESCE(sc.teams, 0)::int AS teams,
                        COALESCE(pc.players, 0)::int AS players,
                        COALESCE(sc.matches, 0)::int AS matches,
                        total_players.players AS total_players
                    FROM active_competitions ac
                    CROSS JOIN total_players
                    LEFT JOIN standing_counts sc ON sc.competition_id = ac.id
                    LEFT JOIN player_counts pc ON pc.competition_id = ac.id
                    ORDER BY ac.name ASC
                `.execute(db);
'''
leagues = leagues[:snapshot_start] + new_snapshot + leagues[snapshot_end:]
leagues = replace_once(
    leagues,
    '                        players: Number(totalPlayerIds.rows[0]?.players ?? 0),',
    '                        players: Number(snapshot.rows[0]?.total_players ?? 0),',
    'snapshot total players response',
)
leagues_path.write_text(leagues)

print('Applied P0 query shape rewrites.')
