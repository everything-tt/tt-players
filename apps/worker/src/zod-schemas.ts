import { z } from 'zod/v4';

// ─── Standings API ────────────────────────────────────────────────────────────

export const StandingSchema = z.object({
    entrantId: z.number(),
    teamId: z.number(),
    fullName: z.string(),
    name: z.string(),
    position: z.number(),
    played: z.number(),
    won: z.number(),
    drawn: z.number(),
    lost: z.number(),
    setsFor: z.number(),
    setsAgainst: z.number(),
    gamesFor: z.number(),
    gamesAgainst: z.number(),
    gamePointsFor: z.number(),
    gamePointsAgainst: z.number(),
    adjustment: z.number(),
    pointsAgainst: z.number(),
    points: z.number(),
    competitionId: z.number(),
});

export const StandingsResponseSchema = z.array(StandingSchema);

export type Standing = z.infer<typeof StandingSchema>;

// ─── Matches API ──────────────────────────────────────────────────────────────

export const MatchTeamSchema = z.object({
    id: z.number(),
    teamId: z.number().nullable(),
    name: z.string().nullable(),
    displayName: z.string().nullable(),
    score: z.number().nullable(),
    clubId: z.number().nullable(),
    userId: z.string().nullable(),
    members: z.array(z.unknown()),
    reserves: z.array(z.unknown()),
    type: z.number(),
    points: z.number().nullable(),
});

export const MatchSchema = z.object({
    id: z.number(),
    date: z.string().nullable(),
    time: z.string().nullable(),
    week: z.number().nullable(),
    name: z.string(),
    venue: z.string().nullable(),
    competitionId: z.number(),
    divisionId: z.number(),
    leagueId: z.number(),
    hasResults: z.boolean(),
    manual: z.boolean(),
    forfeit: z.unknown().nullable(),
    abandoned: z.unknown().nullable(),
    round: z.unknown().nullable(),
    home: MatchTeamSchema,
    away: MatchTeamSchema,
});

export const MatchGroupSchema = z.object({
    type: z.number(),
    date: z.string().nullable(),
    week: z.number().nullable(),
    title: z.string(),
    range: z.number(),
    matches: z.array(MatchSchema),
});

export const MatchesResponseSchema = z.object({
    groups: z.array(MatchGroupSchema),
    matches: z.array(MatchSchema),
});

export type Match = z.infer<typeof MatchSchema>;
export type MatchTeam = z.infer<typeof MatchTeamSchema>;

// ─── Sets (Rubbers) API ──────────────────────────────────────────────────────

export const GameSchema = z.object({
    id: z.number(),
    home: z.number().nullable(),
    away: z.number().nullable(),
    ordering: z.number(),
});

export const PlayerSchema = z.object({
    entrantId: z.number(),
    userId: z.string(),
    name: z.string(),
    playerId: z.number(),
    ordering: z.number(),
    type: z.number(),
    forfeit: z.unknown().nullable(),
});

export const SetSchema = z.object({
    id: z.number(),
    matchId: z.number(),
    scores: z.string(),
    homeScore: z.number().nullable(),
    awayScore: z.number().nullable(),
    ordering: z.number(),
    fixed: z.boolean(),
    completed: z.string().nullable(),
    locked: z.boolean(),
    homeId: z.number(),
    awayId: z.number(),
    homePlayers: z.array(PlayerSchema),
    awayPlayers: z.array(PlayerSchema),
    games: z.array(GameSchema),
});

export const SetsResponseSchema = z.array(SetSchema);

export type TTSet = z.infer<typeof SetSchema>;
export type TTPlayer = z.infer<typeof PlayerSchema>;
