import type { FixtureStatus, OutcomeType } from '@tt-players/db';
import {
    StandingsResponseSchema,
    MatchesResponseSchema,
    SetsResponseSchema,
    type Standing,
    type Match,
    type TTSet,
} from './zod-schemas.js';

// ─── Name Normalization ───────────────────────────────────────────────────────

/**
 * Normalises a player name for storage:
 * - Collapses multiple spaces to a single space.
 * - Trims leading/trailing whitespace.
 * - Converts ALL CAPS or all lowercase names to title case.
 * - For mixed-case names, capitalises individual all-lowercase words.
 *
 * Preserves legitimate capitalisation patterns such as "McEvoy",
 * "O'Neill", or "Cindy LO".
 */
export function normalizePlayerName(name: string): string {
    const collapsed = name.replace(/\s+/g, ' ').trim();
    if (!collapsed) return collapsed;

    const isAllUpper = collapsed === collapsed.toUpperCase() && collapsed !== collapsed.toLowerCase();
    const isAllLower = collapsed === collapsed.toLowerCase() && collapsed !== collapsed.toUpperCase();

    if (isAllUpper || isAllLower) {
        return collapsed.split(' ').map((word) => {
            if (word.length === 0) return word;
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }).join(' ');
    }

    // Mixed case: normalise each word individually.
    // - All-lowercase words (length > 1) → capitalise first letter.
    // - All-uppercase words (length > 1) → title case (first upper, rest lower).
    //   Handles surnames like "MARTEAU" in "MARTEAU Berenice".
    // - Words with mixed casing (e.g. "McEvoy", "O'Neill") are preserved.
    return collapsed.split(' ').map((word) => {
        if (word.length <= 1) return word;
        const isWordAllLower = word === word.toLowerCase() && word !== word.toUpperCase();
        const isWordAllUpper = word === word.toUpperCase() && word !== word.toLowerCase();
        if (isWordAllLower) {
            return word.charAt(0).toUpperCase() + word.slice(1);
        }
        if (isWordAllUpper) {
            return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
        }
        return word;
    }).join(' ');
}

// ─── Output Types ─────────────────────────────────────────────────────────────

export interface ParsedTeam {
    externalId: string;  // teamId from API (stringified)
    name: string;
}

export interface ParsedPlayer {
    externalId: string | null;
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

    // 3. Extract only source-linked players. TT Leagues may include team-level
    //    forfeit placeholders or unregistered/anonymous participants with an
    //    empty userId. Neither can be linked reliably to a player in our system,
    //    so do not create external_players rows for them.
    const playerMap = new Map<string, ParsedPlayer>();

    for (const sets of Object.values(setsMap)) {
        for (const set of sets.filter(isScoredSet)) {
            const allPlayers = [...set.homePlayers, ...set.awayPlayers];
            for (const player of allPlayers) {
                if (!player.userId) continue;
                if (!playerMap.has(player.userId)) {
                    playerMap.set(player.userId, {
                        externalId: player.userId,
                        name: normalizePlayerName(player.name),
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

    // Match IDs whose sets should be skipped. The TT Leagues API returns
    // set templates with default scores (e.g. 0-0 or 3-0) and no player
    // assignments for abandoned (postponed) matches and for matches that
    // have not yet been played (hasResults = false). Ingesting these as
    // rubbers creates spurious "normal" results with no players.
    const skippedMatchIds = new Set(
        validMatches
            .filter((m) => m.abandoned != null || !m.hasResults)
            .map((m) => String(m.id)),
    );

    // 5. Extract rubbers from sets (skip sets from abandoned/upcoming matches)
    const rubbers: ParsedRubber[] = [];
    for (const [matchId, sets] of Object.entries(setsMap)) {
        if (skippedMatchIds.has(matchId)) continue;
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

function mapSetToRubber(set: TTSet & { homeScore: number; awayScore: number }): ParsedRubber {
    const isDoubles = set.homePlayers.length > 1 || set.awayPlayers.length > 1;

    return {
        externalId: String(set.id),
        matchExternalId: String(set.matchId),
        isDoubles,
        // Only source-linked users can participate in our player model.
        // Preserve the rubber and score even when one/both source userIds are absent.
        homePlayers: set.homePlayers.map((p) => p.userId).filter(Boolean),
        awayPlayers: set.awayPlayers.map((p) => p.userId).filter(Boolean),
        homeGamesWon: set.homeScore,
        awayGamesWon: set.awayScore,
        outcomeType: deriveOutcomeType(set),
    };
}
