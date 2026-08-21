import type { ColumnType, Generated, Insertable, Selectable, Updateable } from 'kysely';
import type { Database as CoreDatabase } from './types.js';

export type SourceDiscoveryStatus =
    | 'healthy'
    | 'no_active_competition'
    | 'ambiguous'
    | 'failed';

export type SourceResourceLifecycle =
    | 'candidate'
    | 'active'
    | 'historical'
    | 'blocked_pending_review';

export interface SourceInstancesTable {
    id: Generated<string>;
    platform_id: string;
    key: string;
    name: string;
    base_url: string;
    adapter_key: string;
    enabled: Generated<boolean>;
    config: unknown;
    discovery_status: Generated<SourceDiscoveryStatus>;
    last_discovery_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
    last_discovery_error: ColumnType<string | null, string | null | undefined, string | null>;
    discovery_metadata: Generated<unknown>;
    first_seen_at: Generated<Date>;
    last_seen_at: ColumnType<Date, Date | undefined, Date>;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type SourceInstance = Selectable<SourceInstancesTable>;
export type NewSourceInstance = Insertable<SourceInstancesTable>;
export type SourceInstanceUpdate = Updateable<SourceInstancesTable>;

export interface SourceResourcesTable {
    id: Generated<string>;
    source_instance_id: string;
    resource_type: string;
    external_id: string;
    name: string | null;
    public_url: string | null;
    adapter_version: string;
    refresh_policy: unknown;
    enabled: Generated<boolean>;
    lifecycle: Generated<SourceResourceLifecycle>;
    league_id: string | null;
    season_id: string | null;
    competition_id: string | null;
    last_fetched_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
    last_succeeded_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
    last_parsed_at: ColumnType<Date | null, Date | null | undefined, Date | null>;
    last_error: string | null;
    consecutive_failures: Generated<number>;
    created_at: Generated<Date>;
    updated_at: ColumnType<Date, Date | undefined, Date>;
}

export type SourceResource = Selectable<SourceResourcesTable>;
export type NewSourceResource = Insertable<SourceResourcesTable>;
export type SourceResourceUpdate = Updateable<SourceResourcesTable>;

export interface SourceRegistryDatabase {
    source_instances: SourceInstancesTable;
    source_resources: SourceResourcesTable;
}

export interface Database extends CoreDatabase, SourceRegistryDatabase {}
