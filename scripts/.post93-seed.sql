CREATE OR REPLACE FUNCTION uuid_from_text(input text)
RETURNS uuid
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT (
        substr(md5(input), 1, 8) || '-' ||
        substr(md5(input), 9, 4) || '-' ||
        substr(md5(input), 13, 4) || '-' ||
        substr(md5(input), 17, 4) || '-' ||
        substr(md5(input), 21, 12)
    )::uuid
$$;

INSERT INTO platforms (id, name, base_url)
VALUES (uuid_from_text('platform'), 'Benchmark Platform', 'https://benchmark.invalid');

INSERT INTO leagues (id, platform_id, external_id, name)
SELECT
    uuid_from_text('league-' || league_no),
    uuid_from_text('platform'),
    'league-' || league_no,
    'Benchmark League ' || league_no
FROM generate_series(1, 40) AS league_no;

INSERT INTO seasons (id, league_id, external_id, name, is_active)
SELECT
    uuid_from_text('season-' || league_no),
    uuid_from_text('league-' || league_no),
    'season-' || league_no,
    '2026/27',
    true
FROM generate_series(1, 40) AS league_no;

INSERT INTO competitions (id, season_id, external_id, name, type, last_scraped_at)
SELECT
    uuid_from_text('competition-' || league_no || '-' || division_no),
    uuid_from_text('season-' || league_no),
    'competition-' || league_no || '-' || division_no,
    'Division ' || division_no,
    'league',
    now()
FROM generate_series(1, 40) AS league_no
CROSS JOIN generate_series(1, 4) AS division_no;

INSERT INTO teams (id, competition_id, external_id, name)
SELECT
    uuid_from_text('team-' || league_no || '-' || division_no || '-' || team_no),
    uuid_from_text('competition-' || league_no || '-' || division_no),
    'team-' || league_no || '-' || division_no || '-' || team_no,
    'Team ' || league_no || '-' || division_no || '-' || team_no
FROM generate_series(1, 40) AS league_no
CROSS JOIN generate_series(1, 4) AS division_no
CROSS JOIN generate_series(1, 10) AS team_no;

INSERT INTO external_players (id, platform_id, external_id, name, updated_at)
SELECT
    uuid_from_text('player-' || player_no),
    uuid_from_text('platform'),
    'player-' || player_no,
    'Player ' || player_no,
    now()
FROM generate_series(1, 8000) AS player_no;

INSERT INTO league_standings (
    id, competition_id, team_id, position, played, won, drawn, lost, points, updated_at
)
SELECT
    uuid_from_text('standing-' || league_no || '-' || division_no || '-' || team_no),
    uuid_from_text('competition-' || league_no || '-' || division_no),
    uuid_from_text('team-' || league_no || '-' || division_no || '-' || team_no),
    team_no,
    36,
    20,
    4,
    12,
    64 - team_no,
    now()
FROM generate_series(1, 40) AS league_no
CROSS JOIN generate_series(1, 4) AS division_no
CROSS JOIN generate_series(1, 10) AS team_no;

INSERT INTO fixtures (
    id, competition_id, external_id, home_team_id, away_team_id,
    date_played, status, round_name, round_order, updated_at
)
SELECT
    uuid_from_text('fixture-' || league_no || '-' || division_no || '-' || fixture_no),
    uuid_from_text('competition-' || league_no || '-' || division_no),
    'fixture-' || fixture_no,
    uuid_from_text(
        'team-' || league_no || '-' || division_no || '-' ||
        CASE
            WHEN league_no = 1 AND division_no = 1 THEN 1
            ELSE ((fixture_no - 1) % 10) + 1
        END
    ),
    uuid_from_text(
        'team-' || league_no || '-' || division_no || '-' ||
        CASE
            WHEN league_no = 1 AND division_no = 1 THEN 2
            ELSE (fixture_no % 10) + 1
        END
    ),
    DATE '2026-07-31' - ((fixture_no - 1) % 730),
    CASE WHEN fixture_no % 10 = 0 THEN 'upcoming'::fixture_status ELSE 'completed'::fixture_status END,
    'Round ' || fixture_no,
    fixture_no,
    now()
FROM generate_series(1, 40) AS league_no
CROSS JOIN generate_series(1, 4) AS division_no
CROSS JOIN LATERAL generate_series(
    1,
    CASE WHEN league_no = 1 THEN 1000 ELSE 50 END
) AS fixture_no;

INSERT INTO rubbers (
    id, fixture_id, external_id, is_doubles,
    home_player_1_id, home_player_2_id, away_player_1_id, away_player_2_id,
    home_games_won, away_games_won, outcome_type, updated_at
)
SELECT
    uuid_from_text(
        'rubber-' || league_no || '-' || division_no || '-' || fixture_no || '-' || rubber_no
    ),
    uuid_from_text('fixture-' || league_no || '-' || division_no || '-' || fixture_no),
    'rubber-' || rubber_no,
    rubber_no > 4,
    uuid_from_text('player-' || (((league_no * 100000 + division_no * 10000 + fixture_no * 10 + rubber_no) % 8000) + 1)),
    CASE WHEN rubber_no > 4 THEN uuid_from_text('player-' || (((league_no * 100000 + division_no * 10000 + fixture_no * 10 + rubber_no + 101) % 8000) + 1)) ELSE NULL END,
    uuid_from_text('player-' || (((league_no * 100000 + division_no * 10000 + fixture_no * 10 + rubber_no + 203) % 8000) + 1)),
    CASE WHEN rubber_no > 4 THEN uuid_from_text('player-' || (((league_no * 100000 + division_no * 10000 + fixture_no * 10 + rubber_no + 307) % 8000) + 1)) ELSE NULL END,
    CASE WHEN rubber_no % 2 = 0 THEN 3 ELSE 1 END,
    CASE WHEN rubber_no % 2 = 0 THEN 1 ELSE 3 END,
    'normal',
    now()
FROM generate_series(1, 40) AS league_no
CROSS JOIN generate_series(1, 4) AS division_no
CROSS JOIN LATERAL generate_series(
    1,
    CASE WHEN league_no = 1 THEN 1000 ELSE 50 END
) AS fixture_no
CROSS JOIN generate_series(1, 8) AS rubber_no;

VACUUM (ANALYZE);
