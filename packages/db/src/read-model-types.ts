import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';

export interface DataVersionsTable {
    key: string;
    version: ColumnType<string, number | string | undefined, number | string>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type DataVersion = Selectable<DataVersionsTable>;
export type NewDataVersion = Insertable<DataVersionsTable>;
export type DataVersionUpdate = Updateable<DataVersionsTable>;

export interface SourceQualitySnapshotsTable {
    key: string;
    content: unknown;
    generated_at: ColumnType<Date, Date | string, Date | string>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type SourceQualitySnapshot = Selectable<SourceQualitySnapshotsTable>;
export type NewSourceQualitySnapshot = Insertable<SourceQualitySnapshotsTable>;
export type SourceQualitySnapshotUpdate = Updateable<SourceQualitySnapshotsTable>;

export interface RatingAuditSnapshotsTable {
    model_id: string;
    content: unknown;
    generated_at: ColumnType<Date, Date | string, Date | string>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type RatingAuditSnapshot = Selectable<RatingAuditSnapshotsTable>;
export type NewRatingAuditSnapshot = Insertable<RatingAuditSnapshotsTable>;
export type RatingAuditSnapshotUpdate = Updateable<RatingAuditSnapshotsTable>;

export interface RatingAuditIssuesTable {
    id: Generated<string>;
    model_id: string;
    issue_type: string;
    severity: 'info' | 'warning' | 'critical';
    entity_type: string;
    entity_id: string;
    source_id: string | null;
    competition_id: string | null;
    match_date: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
    details: unknown;
    snapshot_generated_at: ColumnType<Date, Date | string, Date | string>;
    first_seen_at: ColumnType<Date, Date | string | undefined, Date | string>;
    last_seen_at: ColumnType<Date, Date | string | undefined, Date | string>;
    resolved_at: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
}

export type RatingAuditIssue = Selectable<RatingAuditIssuesTable>;
export type NewRatingAuditIssue = Insertable<RatingAuditIssuesTable>;
export type RatingAuditIssueUpdate = Updateable<RatingAuditIssuesTable>;

export type RatingPlayerCoverageCategory =
    | 'covered'
    | 'no_raw_matches'
    | 'only_doubles'
    | 'only_non_normal'
    | 'only_invalid_singles'
    | 'only_before_model_window'
    | 'eligible_in_window_without_rating'
    | 'rating_without_eligible_evidence';

export interface RatingPlayerCoverageTable {
    model_id: string;
    player_id: string;
    category: RatingPlayerCoverageCategory;
    raw_matches: number;
    singles_matches: number;
    normal_singles_matches: number;
    eligible_matches_all_time: number;
    eligible_matches_in_window: number;
    unique_opponents_in_window: number;
    first_match_date: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
    last_match_date: ColumnType<Date | null, Date | string | null | undefined, Date | string | null>;
    rating_exists: boolean;
    rated_matches: number | null;
    rating_deviation: number | null;
    updated_at: ColumnType<Date, Date | string | undefined, Date | string>;
}

export type RatingPlayerCoverage = Selectable<RatingPlayerCoverageTable>;
export type NewRatingPlayerCoverage = Insertable<RatingPlayerCoverageTable>;
export type RatingPlayerCoverageUpdate = Updateable<RatingPlayerCoverageTable>;

export interface PlayerActiveLeaguesTable {
    player_id: string;
    league_id: string;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type PlayerActiveLeague = Selectable<PlayerActiveLeaguesTable>;
export type NewPlayerActiveLeague = Insertable<PlayerActiveLeaguesTable>;
export type PlayerActiveLeagueUpdate = Updateable<PlayerActiveLeaguesTable>;

export interface ReadModelDatabase {
    data_versions: DataVersionsTable;
    source_quality_snapshots: SourceQualitySnapshotsTable;
    rating_audit_snapshots: RatingAuditSnapshotsTable;
    rating_audit_issues: RatingAuditIssuesTable;
    rating_player_coverage: RatingPlayerCoverageTable;
    player_active_leagues: PlayerActiveLeaguesTable;
}
