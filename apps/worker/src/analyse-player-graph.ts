import dotenv from 'dotenv';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { db } from '@tt-players/db';
import { sql } from 'kysely';
import {
    analysePlayerGraph,
    renderPlayerGraphMarkdown,
    type PlayerGraphMatch,
} from './player-graph-analysis.js';
import {
    DEFAULT_PLAYER_GRAPH_HALF_LIFE_DAYS,
    DEFAULT_PLAYER_GRAPH_WINDOW_DAYS,
    resolvePlayerGraphDecay,
} from './player-graph-run-config.js';

dotenv.config();

interface MatchRow {
    rubber_id: string;
    match_date: string | Date;
    home_player_id: string;
    home_player_name: string;
    away_player_id: string;
    away_player_name: string;
    home_games_won: number | string;
    away_games_won: number | string;
    league_id: string;
    league_name: string;
    competition_id: string;
    competition_name: string;
    home_team_name: string | null;
    away_team_name: string | null;
}

const windowDays = integerArgument('--window-days', DEFAULT_PLAYER_GRAPH_WINDOW_DAYS);
const noDecay = flagArgument('--no-decay');
const halfLifeArgument = optionalPositiveNumberArgument('--half-life-days');
const decay = resolvePlayerGraphDecay({ noDecay, halfLifeDays: halfLifeArgument });
const minMatchCount = integerArgument('--min-match-count', 1);
const minEdgeWeight = numberArgument('--min-edge-weight', 0);
const endDate = argumentValue('--end-date') ?? todayUtc();
const startDate = addDays(endDate, -(windowDays - 1));
const outputJson = resolve(argumentValue('--output-json') ?? 'player-graph-analysis.json');
const outputMarkdown = resolve(argumentValue('--output-markdown') ?? 'player-graph-analysis.md');

try {
    console.log(`player graph: loading singles matches ${startDate} to ${endDate}`);
    console.log(
        decay.mode === 'none'
            ? 'player graph: recency decay disabled'
            : `player graph: recency half-life ${decay.halfLifeDays} days`,
    );
    const matches = await loadPlayerGraphMatches(startDate, endDate);
    console.log(`player graph: loaded ${matches.length} matches`);

    const report = analysePlayerGraph(matches, {
        windowStart: startDate,
        windowEnd: endDate,
        halfLifeDays: decay.effectiveHalfLifeDays,
        minMatchCount,
        minEdgeWeight,
    });

    if (decay.mode === 'none') {
        report.methodology.notes.unshift(
            'Recency decay was disabled for this run: every retained match contributes 1.0 to its player-pair edge.',
        );
    }

    const jsonReport = {
        ...report,
        runConfig: {
            windowDays,
            decayMode: decay.mode,
            halfLifeDays: decay.halfLifeDays,
        },
    };
    const markdownReport = decay.mode === 'none'
        ? renderPlayerGraphMarkdown(report).replace(
            `Recency half-life: ${report.methodology.halfLifeDays} days`,
            'Recency decay: disabled (each match weight = 1.0)',
        )
        : renderPlayerGraphMarkdown(report);

    await mkdir(dirname(outputJson), { recursive: true });
    await mkdir(dirname(outputMarkdown), { recursive: true });
    await writeFile(outputJson, `${JSON.stringify(jsonReport, null, 2)}\n`, 'utf8');
    await writeFile(outputMarkdown, markdownReport, 'utf8');

    console.log(`Player graph analysis generated at ${report.generatedAt}`);
    console.log(`Communities: ${report.totals.communities}`);
    console.log(`Modularity: ${report.totals.modularity}`);
    console.log(`JSON report: ${outputJson}`);
    console.log(`Markdown report: ${outputMarkdown}`);
    console.log(`PLAYER_GRAPH_ANALYSIS=${JSON.stringify({
        generatedAt: report.generatedAt,
        windowStart: startDate,
        windowEnd: endDate,
        windowDays,
        decayMode: decay.mode,
        halfLifeDays: decay.halfLifeDays,
        matches: report.totals.matchesConsidered,
        activePlayers: report.totals.activePlayers,
        weightedEdges: report.totals.weightedEdges,
        communities: report.totals.communities,
        modularity: report.totals.modularity,
        communitiesSpanningCompetitions:
            report.validationSignals.communitiesSpanningCompetitions,
        communitiesSpanningLeagues:
            report.validationSignals.communitiesSpanningLeagues,
        recommendation: report.validationSignals.recommendation,
        outputJson,
        outputMarkdown,
    })}`);
} finally {
    await db.destroy();
}

async function loadPlayerGraphMatches(
    windowStart: string,
    windowEnd: string,
): Promise<PlayerGraphMatch[]> {
    const result = await sql<MatchRow>`
        SELECT
            rubber.id AS rubber_id,
            COALESCE(rubber.played_at, fixture.date_played)::date AS match_date,
            COALESCE(home_player.canonical_player_id, home_player.id) AS home_player_id,
            COALESCE(home_canonical.name, home_player.name) AS home_player_name,
            COALESCE(away_player.canonical_player_id, away_player.id) AS away_player_id,
            COALESCE(away_canonical.name, away_player.name) AS away_player_name,
            rubber.home_games_won,
            rubber.away_games_won,
            league.id AS league_id,
            league.name AS league_name,
            competition.id AS competition_id,
            COALESCE(competition.display_name, competition.name) AS competition_name,
            home_team.name AS home_team_name,
            away_team.name AS away_team_name
        FROM rubbers rubber
        JOIN fixtures fixture
          ON fixture.id = rubber.fixture_id
        JOIN competitions competition
          ON competition.id = fixture.competition_id
        JOIN seasons season
          ON season.id = competition.season_id
        JOIN leagues league
          ON league.id = season.league_id
        JOIN external_players home_player
          ON home_player.id = rubber.home_player_1_id
        JOIN external_players away_player
          ON away_player.id = rubber.away_player_1_id
        LEFT JOIN external_players home_canonical
          ON home_canonical.id = home_player.canonical_player_id
        LEFT JOIN external_players away_canonical
          ON away_canonical.id = away_player.canonical_player_id
        LEFT JOIN teams home_team
          ON home_team.id = fixture.home_team_id
        LEFT JOIN teams away_team
          ON away_team.id = fixture.away_team_id
        WHERE rubber.deleted_at IS NULL
          AND fixture.deleted_at IS NULL
          AND competition.deleted_at IS NULL
          AND season.deleted_at IS NULL
          AND league.deleted_at IS NULL
          AND home_player.deleted_at IS NULL
          AND away_player.deleted_at IS NULL
          AND rubber.is_doubles = false
          AND rubber.outcome_type IN ('normal', 'retired')
          AND COALESCE(rubber.played_at, fixture.date_played) IS NOT NULL
          AND COALESCE(rubber.played_at, fixture.date_played)::date >= ${windowStart}::date
          AND COALESCE(rubber.played_at, fixture.date_played)::date <= ${windowEnd}::date
          AND COALESCE(home_player.canonical_player_id, home_player.id)
              <> COALESCE(away_player.canonical_player_id, away_player.id)
        ORDER BY match_date, rubber.id
    `.execute(db);

    return result.rows.map((row) => ({
        rubberId: row.rubber_id,
        playedAt: toDateString(row.match_date),
        homePlayerId: row.home_player_id,
        homePlayerName: row.home_player_name,
        awayPlayerId: row.away_player_id,
        awayPlayerName: row.away_player_name,
        homeGamesWon: Number(row.home_games_won),
        awayGamesWon: Number(row.away_games_won),
        leagueId: row.league_id,
        leagueName: row.league_name,
        competitionId: row.competition_id,
        competitionName: row.competition_name,
        homeTeamName: row.home_team_name,
        awayTeamName: row.away_team_name,
    }));
}

function argumentValue(name: string): string | undefined {
    const argument = process.argv.find((value) => value.startsWith(`${name}=`));
    return argument?.slice(name.length + 1) || undefined;
}

function flagArgument(name: string): boolean {
    return process.argv.includes(name);
}

function integerArgument(name: string, fallback: number): number {
    const raw = argumentValue(name);
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`${name} must be a positive integer`);
    }
    return value;
}

function optionalPositiveNumberArgument(name: string): number | undefined {
    const raw = argumentValue(name);
    if (raw === undefined) return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`${name} must be greater than zero`);
    }
    return value;
}

function numberArgument(name: string, fallback: number): number {
    const raw = argumentValue(name);
    const value = raw === undefined ? fallback : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(`${name} must be zero or greater`);
    }
    return value;
}

function todayUtc(): string {
    return new Date().toISOString().slice(0, 10);
}

function addDays(date: string, days: number): string {
    const value = new Date(`${date}T00:00:00.000Z`);
    if (Number.isNaN(value.getTime())) throw new Error(`Invalid date: ${date}`);
    value.setUTCDate(value.getUTCDate() + days);
    return value.toISOString().slice(0, 10);
}

function toDateString(value: string | Date): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    return value.slice(0, 10);
}
