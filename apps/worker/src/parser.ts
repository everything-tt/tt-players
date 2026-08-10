import type { FixtureStatus, OutcomeType } from '@tt-players/db';
import {
    StandingsResponseSchema,
    MatchesResponseSchema,
    SetsResponseSchema,
    type Standing,
    type Match,
    type TTSet,
    type TTPlayer,
} from './zod-schemas.js';

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface ParsedTeam {
    externalId: string;  // teamId from API (stringified)
    name: string;
}

export interface ParsedPlayer {
    externalId: string | null;  // userId (UUID string), null if empty
    name: string;
}

export interface ParsedFixture {
    externalId: string;          // match id (stringified)
    homeTeamExternalId: string | null;  // teamId (stringified), null for individual events
    awayTeamExternalId: string | null;  // teamId (stringified), null for individual events
    datePlayed: string | null;   // ISO date string, null if unscheduled
    status: FixtureStatus;
    roundName: string | null;
    roundOrder: number | null;
}

export interface ParsedRubber {
    externalId: string;           // set id (stringified)
    matchExternalId: string;      // match id (stringified)
    isDoubles: boolean;
    homePlayers: string[];        // userId strings
    awayPlayers: string[];        // userId strings
    homeGamesWon: number;
    awayGamesWon: number;
    outcomeType: OutcomeType;
    scoreSource?: 'games' | 'win_loss_only';
    playedAt?: string | null;
}

export interface ParsedStanding {
    teamExternalId: string;  // teamId (stringified)
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points: number;
}

export interface ParsedTTLeaguesData {
    teams: ParsedTeam[];
    players: ParsedPlayer[];
    fixtures: ParsedFixture[];
    rubbers: ParsedRubber[];
    standings: ParsedStanding[];
}

// ─── Input Type ───────────────────────────────────────────────────────────────

export interface RawTTLeaguesInput {
    standings: unknown;
    matches: unknown;
    sets: Record<string, unknown>;  // keyed by match ID
}

// ─── Parser ───────────────────────────────────────────────────────────────────

export function parseTTLeaguesData(input: RawTTLeaguesInput): ParsedTTLeaguesData {
    // 1. Validate with Zod
    const standings = StandingsResponseSchema.parse(input.standings);
    const matchesResponse = MatchesResponseSchema.parse(input.matches);

    const setsMap: Record<string, ReturnType<typeof SetsResponseSchema.parse>> = {};
    for (const [matchId, setsData] of Object.entries(input.sets)) {
        setsMap[matchId] = SetsResponseSchema.parse(setsData);
    }

    // 2. Extract teams — deduplicate from standings (primary source) + match teams
    const teamMap = new Map<string, ParsedTeam>();

    for (const standing of standings) {
        const teamExtId = String(standing.teamId);
        if (!teamMap.has(teamExtId)) {
            teamMap.set(teamExtId, {
                externalId: teamExtId,
                name: standing.name,
            });
        }
    }

    for (const match of matchesResponse.matches) {
        // Skip matches with missing team info (TBA/placeholder)
        if (match.home.teamId == null || match.away.teamId == null) continue;

        const homeExtId = String(match.home.teamId);
        const awayExtId = String(match.away.teamId);
        if (!teamMap.has(homeExtId) && match.home.name) {
            teamMap.set(homeExtId, { externalId: homeExtId, name: match.home.name });
        }
        if (!teamMap.has(awayExtId) && match.away.name) {
            teamMap.set(awayExtId, { externalId: awayExtId, name: match.away.name });
        }
    }

    // 3. Extract players — deduplicate from all rubber sets by userId.
    //    Skip team-level placeholders: for forfeited matches the TT Leagues
    //    API lists the team as the "player" (empty userId, entrantId = match
    //    entrant id, name = team name). Those must never become
    //    external_players rows; the rubber is still created as a walkover
    //    with no player references.
    const matchById = new Map(
        matchesResponse.matches.map((match) => [String(match.id), match]),
    );
    const playerMap = new Map<string, ParsedPlayer>();

    for (const [matchId, sets] of Object.entries(setsMap)) {
        const match = matchById.get(matchId);
        for (const set of sets.filter(isScoredSet)) {
            const allPlayers = [...set.homePlayers, ...set.awayPlayers];
            for (const player of allPlayers) {
                if (isTeamPlaceholderPlayer(player, match)) continue;
                const extId = player.userId || null;
                const key = extId ?? `unnamed_${player.playerId}`;
                if (!playerMap.has(key)) {
                    playerMap.set(key, {
                        externalId: extId,
                        name: player.name,
                    });
                }
            }
        }
    }

    // 4. Extract fixtures from the flat matches array (skip TBA matches)
    const validMatches = matchesResponse.matches.filter(
        (m) => m.home.teamId != null && m.away.teamId != null,
    );
    const fixtures: ParsedFixture[] = validMatches.map((match) =>
        mapMatchToFixture(match),
    );

    // 5. Extract rubbers from sets
    const rubbers: ParsedRubber[] = [];
    for (const sets of Object.values(setsMap)) {
        for (const set of sets.filter(isScoredSet)) {
            rubbers.push(mapSetToRubber(set));
        }
    }

    // 6. Extract league standings
    const parsedStandings: ParsedStanding[] = standings.map((s) => ({
        teamExternalId: String(s.teamId),
        position: s.position,
        played: s.played,
        won: s.won,
        drawn: s.drawn,
        lost: s.lost,
        points: s.points,
    }));

    return {
        teams: Array.from(teamMap.values()),
        players: Array.from(playerMap.values()),
        fixtures,
        rubbers,
        standings: parsedStandings,
    };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function deriveFixtureStatus(match: Match): FixtureStatus {
    if (match.abandoned) return 'postponed';
    if (match.forfeit) return 'completed';
    if (match.hasResults) return 'completed';
    return 'upcoming';
}

function mapMatchToFixture(match: Match): ParsedFixture {
    return {
        externalId: String(match.id),
        homeTeamExternalId: String(match.home.teamId),
        awayTeamExternalId: String(match.away.teamId),
        datePlayed: match.date ?? null,
        status: deriveFixtureStatus(match),
        roundName: match.round != null ? String(match.round) : null,
        roundOrder: null,
    };
}

function deriveOutcomeType(set: TTSet): OutcomeType {
    const allPlayers = [...set.homePlayers, ...set.awayPlayers];
    const hasForfeit = allPlayers.some((p) => p.forfeit != null);
    if (hasForfeit) return 'walkover';
    return 'normal';
}

function isScoredSet(set: TTSet): set is TTSet & { homeScore: number; awayScore: number } {
    return set.homeScore != null && set.awayScore != null;
}

/**
 * TT Leagues lists the team as the "player" in set data for forfeited
 * matches: userId is empty and entrantId matches the match's home/away
 * entrant id. These are team-level placeholders, not people, and must not
 * be turned into external_players rows.
 */
function isTeamPlaceholderPlayer(player: TTPlayer, match: Match | undefined): boolean {
    if (player.userId) return false;
    if (!match) return false;
    return player.entrantId === match.home.id || player.entrantId === match.away.id;
}

function mapSetToRubber(set: TTSet & { homeScore: number; awayScore: number }): ParsedRubber {
    const isDoubles = set.homePlayers.length > 1 || set.awayPlayers.length > 1;

    return {
        externalId: String(set.id),
        matchExternalId: String(set.matchId),
        isDoubles,
        // Team-level forfeit placeholders carry an empty userId; drop them so
        // walkover rubbers have no player references instead of empty strings.
        homePlayers: set.homePlayers.map((p) => p.userId).filter(Boolean),
        awayPlayers: set.awayPlayers.map((p) => p.userId).filter(Boolean),
        homeGamesWon: set.homeScore,
        awayGamesWon: set.awayScore,
        outcomeType: deriveOutcomeType(set),
    };
}
