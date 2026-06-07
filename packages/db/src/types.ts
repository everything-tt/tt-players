import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

// ─── Enum Types ───────────────────────────────────────────────────────────────

export type CompetitionType = 'league' | 'team_cup' | 'individual';

export type FixtureStatus = 'upcoming' | 'completed' | 'postponed';

export type OutcomeType = 'normal' | 'walkover' | 'retired' | 'void';

export type ScoreSource = 'games' | 'win_loss_only';

export type RankingListKind = 'ranking' | 'rating';

export type ScrapeStatus = 'pending' | 'processed' | 'failed';

// ─── Table Types ──────────────────────────────────────────────────────────────

export interface PlatformsTable {
    id: Generated<string>;
    name: string;
    base_url: string;
    created_at: Generated<Date>;
}

export type Platform = Selectable<PlatformsTable>;
export type NewPlatform = Insertable<PlatformsTable>;
export type PlatformUpdate = Updateable<PlatformsTable>;

export interface LeaguesTable {
    id: Generated<string>;
    platform_id: string;
    external_id: string;
    name: string;
    created_at: Generated<Date>;
    deleted_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type League = Selectable<LeaguesTable>;
export type NewLeague = Insertable<LeaguesTable>;
export type LeagueUpdate = Updateable<LeaguesTable>;

export interface RegionsTable {
    id: Generated<string>;
    slug: string;
    name: string;
    created_at: Generated<Date>;
}

export type Region = Selectable<RegionsTable>;
export type NewRegion = Insertable<RegionsTable>;
export type RegionUpdate = Updateable<RegionsTable>;

export interface LeagueRegionsTable {
    id: Generated<string>;
    league_id: string;
    region_id: string;
    created_at: Generated<Date>;
}

export type LeagueRegion = Selectable<LeagueRegionsTable>;
export type NewLeagueRegion = Insertable<LeagueRegionsTable>;
export type LeagueRegionUpdate = Updateable<LeagueRegionsTable>;

export interface SeasonsTable {
    id: Generated<string>;
    league_id: string;
    external_id: string;
    name: string;
    is_active: Generated<boolean>;
    created_at: Generated<Date>;
    deleted_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type Season = Selectable<SeasonsTable>;
export type NewSeason = Insertable<SeasonsTable>;
export type SeasonUpdate = Updateable<SeasonsTable>;

export interface CompetitionsTable {
    id: Generated<string>;
    season_id: string;
    external_id: string;
    name: string;
    display_name: string | null;
    event_date: ColumnType<Date | null, string | Date | null, string | Date | null>;
    category: string | null;
    type: CompetitionType;
    source: string | null;
    source_url: string | null;
    last_scraped_at: ColumnType<Date | null, Date | null, Date | null>;

    created_at: Generated<Date>;
    deleted_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type Competition = Selectable<CompetitionsTable>;
export type NewCompetition = Insertable<CompetitionsTable>;
export type CompetitionUpdate = Updateable<CompetitionsTable>;

export interface TeamsTable {
    id: Generated<string>;
    competition_id: string;
    external_id: string;
    name: string;
    created_at: Generated<Date>;
    deleted_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type Team = Selectable<TeamsTable>;
export type NewTeam = Insertable<TeamsTable>;
export type TeamUpdate = Updateable<TeamsTable>;

export interface ExternalPlayersTable {
    id: Generated<string>;
    platform_id: string;
    external_id: string | null;
    canonical_player_id: string | null;
    name: string;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
    deleted_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type ExternalPlayer = Selectable<ExternalPlayersTable>;
export type NewExternalPlayer = Insertable<ExternalPlayersTable>;
export type ExternalPlayerUpdate = Updateable<ExternalPlayersTable>;

export interface LeagueStandingsTable {
    id: Generated<string>;
    competition_id: string;
    team_id: string;
    position: number;
    played: number;
    won: number;
    drawn: number;
    lost: number;
    points: number;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
    deleted_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type LeagueStanding = Selectable<LeagueStandingsTable>;
export type NewLeagueStanding = Insertable<LeagueStandingsTable>;
export type LeagueStandingUpdate = Updateable<LeagueStandingsTable>;

export interface FixturesTable {
    id: Generated<string>;
    competition_id: string;
    external_id: string;
    home_team_id: string | null;
    away_team_id: string | null;
    date_played: ColumnType<Date | null, string | Date | null, string | Date | null>;
    status: FixtureStatus;
    round_name: string | null;
    round_order: number | null;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
    deleted_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type Fixture = Selectable<FixturesTable>;
export type NewFixture = Insertable<FixturesTable>;
export type FixtureUpdate = Updateable<FixturesTable>;

export interface RubbersTable {
    id: Generated<string>;
    fixture_id: string;
    external_id: string;
    is_doubles: Generated<boolean>;
    home_player_1_id: string | null;
    home_player_2_id: string | null;
    away_player_1_id: string | null;
    away_player_2_id: string | null;
    home_games_won: number;
    away_games_won: number;
    home_points_scored: number | null;
    away_points_scored: number | null;
    outcome_type: OutcomeType;
    score_source: Generated<ScoreSource>;
    played_at: ColumnType<Date | null, string | Date | null, string | Date | null>;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
    deleted_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type Rubber = Selectable<RubbersTable>;
export type NewRubber = Insertable<RubbersTable>;
export type RubberUpdate = Updateable<RubbersTable>;

export interface RankingCategoriesTable {
    id: Generated<string>;
    platform_id: string;
    external_id: string;
    name: string;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type RankingCategory = Selectable<RankingCategoriesTable>;
export type NewRankingCategory = Insertable<RankingCategoriesTable>;
export type RankingCategoryUpdate = Updateable<RankingCategoriesTable>;

export interface RankingPeriodsTable {
    id: Generated<string>;
    platform_id: string;
    external_id: string;
    label: string;
    period_end_date: ColumnType<Date | null, string | Date | null, string | Date | null>;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type RankingPeriod = Selectable<RankingPeriodsTable>;
export type NewRankingPeriod = Insertable<RankingPeriodsTable>;
export type RankingPeriodUpdate = Updateable<RankingPeriodsTable>;

export interface RankingEntriesTable {
    id: Generated<string>;
    period_id: string;
    category_id: string;
    player_id: string;
    list_kind: RankingListKind;
    ranking_row_external_id: string | null;
    athlete_external_id: string | null;
    rank: number | null;
    points: number | null;
    county_country: string | null;
    inactive_periods: number | null;
    is_initial_rating: Generated<boolean>;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type RankingEntry = Selectable<RankingEntriesTable>;
export type NewRankingEntry = Insertable<RankingEntriesTable>;
export type RankingEntryUpdate = Updateable<RankingEntriesTable>;

export interface RawScrapeLogsTable {
    id: Generated<string>;
    platform_id: string;
    endpoint_url: string;
    raw_payload: string;
    payload_hash: string;
    scraped_at: Generated<Date>;
    status: ScrapeStatus;
}

export type RawScrapeLog = Selectable<RawScrapeLogsTable>;
export type NewRawScrapeLog = Insertable<RawScrapeLogsTable>;
export type RawScrapeLogUpdate = Updateable<RawScrapeLogsTable>;

export interface Sport80EventScrapeStateTable {
    id: Generated<string>;
    event_id: string;
    event_name: string | null;
    event_date: ColumnType<Date | null, string | Date | null, string | Date | null>;
    category: string | null;
    status: ScrapeStatus;
    result_rows: number | null;
    last_error: string | null;
    first_seen_at: Generated<Date>;
    last_attempted_at: ColumnType<Date | null, Date | undefined, Date | null>;
    processed_at: ColumnType<Date | null, Date | undefined, Date | null>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type Sport80EventScrapeState = Selectable<Sport80EventScrapeStateTable>;
export type NewSport80EventScrapeState = Insertable<Sport80EventScrapeStateTable>;
export type Sport80EventScrapeStateUpdate = Updateable<Sport80EventScrapeStateTable>;

export interface SourceEventsTable {
    id: Generated<string>;
    platform_id: string;
    source: string;
    external_id: string;
    name: string;
    event_date: ColumnType<Date | null, string | Date | null, string | Date | null>;
    category: string | null;
    public_url: string | null;
    raw_payload: unknown;
    canonical_competition_id: string | null;
    first_seen_at: Generated<Date>;
    last_seen_at: ColumnType<Date, Date | undefined, Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type SourceEvent = Selectable<SourceEventsTable>;
export type NewSourceEvent = Insertable<SourceEventsTable>;
export type SourceEventUpdate = Updateable<SourceEventsTable>;

export interface SourceEventResultRowsTable {
    id: Generated<string>;
    source_event_id: string;
    source: string;
    external_id: string;
    played_at: ColumnType<Date | null, string | Date | null, string | Date | null>;
    round_name: string | null;
    round_order: number | null;
    round_raw: unknown;
    home_raw: string;
    away_raw: string;
    home_player_name: string;
    home_player_external_id: string;
    away_player_name: string;
    away_player_external_id: string;
    winner_side: string;
    raw_payload: unknown;
    canonical_rubber_id: string | null;
    first_seen_at: Generated<Date>;
    last_seen_at: ColumnType<Date, Date | undefined, Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type SourceEventResultRow = Selectable<SourceEventResultRowsTable>;
export type NewSourceEventResultRow = Insertable<SourceEventResultRowsTable>;
export type SourceEventResultRowUpdate = Updateable<SourceEventResultRowsTable>;

export interface CacheEntriesTable {
    id: Generated<string>;
    type: string;
    cache_key: string;
    content: unknown;
    source_version: string | null;
    expires_at: ColumnType<Date, Date | string, Date | string>;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type CacheEntry = Selectable<CacheEntriesTable>;
export type NewCacheEntry = Insertable<CacheEntriesTable>;
export type CacheEntryUpdate = Updateable<CacheEntriesTable>;

export interface FeedbackTable {
    id: Generated<string>;
    name: string | null;
    email: string | null;
    message_type: string;
    message: string;
    created_at: Generated<Date>;
}

export type Feedback = Selectable<FeedbackTable>;
export type NewFeedback = Insertable<FeedbackTable>;
export type FeedbackUpdate = Updateable<FeedbackTable>;

// ─── Database Interface ───────────────────────────────────────────────────────

/** Tables served by the API — replicated to prod (public schema) */
export interface ApiDatabase {
    platforms: PlatformsTable;
    leagues: LeaguesTable;
    regions: RegionsTable;
    league_regions: LeagueRegionsTable;
    seasons: SeasonsTable;
    competitions: CompetitionsTable;
    teams: TeamsTable;
    external_players: ExternalPlayersTable;
    league_standings: LeagueStandingsTable;
    fixtures: FixturesTable;
    rubbers: RubbersTable;
    cache_entries: CacheEntriesTable;
}

/** Staging tables — worker-only, not replicated to prod (staging schema) */
export interface StagingDatabase {
    'staging.raw_scrape_logs': RawScrapeLogsTable;
    'staging.sport80_event_scrape_state': Sport80EventScrapeStateTable;
    'staging.source_events': SourceEventsTable;
    'staging.source_event_result_rows': SourceEventResultRowsTable;
    'staging.ranking_categories': RankingCategoriesTable;
    'staging.ranking_periods': RankingPeriodsTable;
    'staging.ranking_entries': RankingEntriesTable;
    'staging.feedback': FeedbackTable;

    // Backward-compatible unqualified aliases (resolved via search_path at runtime)
    raw_scrape_logs: RawScrapeLogsTable;
    sport80_event_scrape_state: Sport80EventScrapeStateTable;
    source_events: SourceEventsTable;
    source_event_result_rows: SourceEventResultRowsTable;
    ranking_categories: RankingCategoriesTable;
    ranking_periods: RankingPeriodsTable;
    ranking_entries: RankingEntriesTable;
    feedback: FeedbackTable;
}

/** Full database — used by worker (both schemas) */
export interface Database extends ApiDatabase, StagingDatabase {}

