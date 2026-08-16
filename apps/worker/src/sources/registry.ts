import type { Kysely } from 'kysely';
import type { Database, SourceInstance, SourceResource } from '@tt-players/db';
import type { SourceResourceType } from './adapter.js';

export interface UpsertSourceInstanceInput {
    platformId: string;
    key: string;
    name: string;
    baseUrl: string;
    adapterKey: string;
    enabled?: boolean;
    config?: unknown;
}

export interface UpsertSourceResourceInput {
    sourceInstanceId: string;
    resourceType: SourceResourceType;
    externalId: string;
    adapterVersion: string;
    name?: string | null;
    publicUrl?: string | null;
    refreshPolicy?: unknown;
    enabled?: boolean;
    leagueId?: string | null;
    seasonId?: string | null;
    competitionId?: string | null;
}

export async function upsertSourceInstance(
    db: Kysely<Database>,
    input: UpsertSourceInstanceInput,
): Promise<SourceInstance> {
    const now = new Date();
    return db
        .insertInto('source_instances')
        .values({
            platform_id: input.platformId,
            key: input.key,
            name: input.name,
            base_url: input.baseUrl,
            adapter_key: input.adapterKey,
            enabled: input.enabled ?? true,
            config: input.config ?? {},
            last_seen_at: now,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['platform_id', 'key']).doUpdateSet({
                name: input.name,
                base_url: input.baseUrl,
                adapter_key: input.adapterKey,
                enabled: input.enabled ?? true,
                config: input.config ?? {},
                last_seen_at: now,
                updated_at: now,
            })
        )
        .returningAll()
        .executeTakeFirstOrThrow();
}

export async function upsertSourceResource(
    db: Kysely<Database>,
    input: UpsertSourceResourceInput,
): Promise<SourceResource> {
    const now = new Date();
    return db
        .insertInto('source_resources')
        .values({
            source_instance_id: input.sourceInstanceId,
            resource_type: input.resourceType,
            external_id: input.externalId,
            adapter_version: input.adapterVersion,
            name: input.name ?? null,
            public_url: input.publicUrl ?? null,
            refresh_policy: input.refreshPolicy ?? {},
            enabled: input.enabled ?? true,
            league_id: input.leagueId ?? null,
            season_id: input.seasonId ?? null,
            competition_id: input.competitionId ?? null,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['source_instance_id', 'resource_type', 'external_id']).doUpdateSet({
                adapter_version: input.adapterVersion,
                name: input.name ?? null,
                public_url: input.publicUrl ?? null,
                refresh_policy: input.refreshPolicy ?? {},
                enabled: input.enabled ?? true,
                league_id: input.leagueId ?? null,
                season_id: input.seasonId ?? null,
                competition_id: input.competitionId ?? null,
                updated_at: now,
            })
        )
        .returningAll()
        .executeTakeFirstOrThrow();
}

/**
 * Source-resource health is ordered by fetch-attempt start time. This prevents
 * an older attempt that finishes late from overwriting the health outcome of a
 * newer attempt on another worker replica.
 */
export async function recordSourceResourceSuccess(
    db: Kysely<Database>,
    sourceResourceId: string,
    options: {
        attemptedAt?: Date;
        fetchedAt?: Date;
        parsedAt?: Date;
    } = {},
): Promise<void> {
    const now = new Date();
    const attemptedAt = options.attemptedAt ?? options.fetchedAt ?? now;
    await db
        .updateTable('source_resources')
        .set({
            last_fetched_at: attemptedAt,
            last_succeeded_at: now,
            last_parsed_at: options.parsedAt ?? now,
            last_error: null,
            consecutive_failures: 0,
            updated_at: now,
        })
        .where('id', '=', sourceResourceId)
        .where((eb) => eb.or([
            eb('last_fetched_at', 'is', null),
            eb('last_fetched_at', '<=', attemptedAt),
        ]))
        .executeTakeFirst();
}

export async function recordSourceResourceFailure(
    db: Kysely<Database>,
    sourceResourceId: string,
    error: unknown,
    attemptedAt: Date = new Date(),
): Promise<void> {
    const message = error instanceof Error ? error.message : String(error);
    await db
        .updateTable('source_resources')
        .set((eb) => ({
            last_fetched_at: attemptedAt,
            last_error: message,
            consecutive_failures: eb('consecutive_failures', '+', 1),
            updated_at: new Date(),
        }))
        .where('id', '=', sourceResourceId)
        .where((eb) => eb.or([
            eb('last_fetched_at', 'is', null),
            eb('last_fetched_at', '<=', attemptedAt),
        ]))
        .executeTakeFirst();
}
