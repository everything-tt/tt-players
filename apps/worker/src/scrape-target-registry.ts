import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import type { ScrapeTarget } from './bootstrap.js';
import { upsertSourceInstance, upsertSourceResource } from './sources/registry.js';

const TTL_API_BASE = 'https://ttleagues-api.azurewebsites.net/api';
const CONFIGURED_INSTANCE_PREFIX = 'configured:';
const TARGET_ADAPTER_VERSION = 'legacy-scrape-target-v1';

interface CompetitionContext {
    competitionId: string;
    seasonId: string;
    leagueId: string;
    leagueName: string;
}

export interface PersistedTargetRow {
    resourceId: string;
    resourceExternalId: string;
    resourceName: string | null;
    standingsUrl: string | null;
    competitionId: string;
    platformId: string;
    adapterKey: string;
    instanceBaseUrl: string;
    instanceConfig: unknown;
    leagueName: string;
    seasonActive: boolean;
    fixturesUrl: string | null;
}

function targetDivisionId(externalId: string): string {
    const parts = externalId.split(':');
    if (parts.at(-1) === 'standings' && parts.length >= 2) {
        return parts.at(-2)!;
    }
    return externalId;
}

function configuredInstanceBaseUrl(target: ScrapeTarget): string {
    if (target.platformType === 'ttleagues' && target.tenantHost) {
        return `https://${target.tenantHost}`;
    }
    return new URL(target.url).origin;
}

function instanceTenantHost(row: PersistedTargetRow): string | null {
    if (row.instanceConfig && typeof row.instanceConfig === 'object') {
        const value = (row.instanceConfig as Record<string, unknown>)['tenantHost'];
        if (typeof value === 'string' && value.trim()) return value.trim();
    }
    try {
        return new URL(row.instanceBaseUrl).host;
    } catch {
        return null;
    }
}

export function persistedScrapeTargetFromRow(row: PersistedTargetRow): ScrapeTarget {
    const divisionExtId = targetDivisionId(row.resourceExternalId);
    const platformType = row.adapterKey === 'tt365' ? 'tt365' : 'ttleagues';
    const url = platformType === 'ttleagues'
        ? `${TTL_API_BASE}/divisions/${divisionExtId}/standings`
        : row.standingsUrl;
    if (!url) {
        throw new Error(`persisted TT365 target ${row.resourceId} is missing standings URL`);
    }

    return {
        url,
        fixturesUrl: platformType === 'tt365' ? row.fixturesUrl : null,
        tenantHost: platformType === 'ttleagues' ? instanceTenantHost(row) : null,
        platformId: row.platformId,
        platformType,
        competitionId: row.competitionId,
        divisionExtId,
        divisionName: (row.resourceName ?? divisionExtId).replace(/\s+standings$/i, ''),
        leagueName: row.leagueName,
        isHistorical: !row.seasonActive,
    };
}

export async function persistConfiguredScrapeTargets(
    database: Kysely<Database>,
    targets: readonly ScrapeTarget[],
): Promise<void> {
    const now = new Date();
    await database
        .updateTable('source_instances')
        .set({ enabled: false, updated_at: now })
        .where('key', 'like', `${CONFIGURED_INSTANCE_PREFIX}%`)
        .execute();

    if (targets.length === 0) return;
    const competitionIds = [...new Set(targets.map((target) => target.competitionId))];
    const contexts = await database
        .selectFrom('competitions as competition')
        .innerJoin('seasons as season', 'season.id', 'competition.season_id')
        .innerJoin('leagues as league', 'league.id', 'season.league_id')
        .select([
            'competition.id as competitionId',
            'season.id as seasonId',
            'league.id as leagueId',
            'league.name as leagueName',
        ])
        .where('competition.id', 'in', competitionIds)
        .execute() as CompetitionContext[];
    const contextByCompetition = new Map(
        contexts.map((context) => [context.competitionId, context]),
    );

    const groups = new Map<string, {
        context: CompetitionContext;
        platformId: string;
        platformType: ScrapeTarget['platformType'];
        baseUrl: string;
        tenantHost: string | null;
        targets: ScrapeTarget[];
    }>();

    for (const target of targets) {
        const context = contextByCompetition.get(target.competitionId);
        if (!context) {
            throw new Error(`configured scrape target competition ${target.competitionId} is missing`);
        }
        const key = `${target.platformId}:${context.leagueId}:${target.platformType}`;
        const existing = groups.get(key);
        if (existing) {
            existing.targets.push(target);
            continue;
        }
        groups.set(key, {
            context,
            platformId: target.platformId,
            platformType: target.platformType,
            baseUrl: configuredInstanceBaseUrl(target),
            tenantHost: target.tenantHost ?? null,
            targets: [target],
        });
    }

    for (const group of groups.values()) {
        const sourceInstance = await upsertSourceInstance(database, {
            platformId: group.platformId,
            key: `${CONFIGURED_INSTANCE_PREFIX}${group.context.leagueId}:${group.platformType}`,
            name: group.context.leagueName,
            baseUrl: group.baseUrl,
            adapterKey: group.platformType,
            enabled: true,
            config: {
                configuredTargetRegistry: true,
                tenantHost: group.tenantHost,
            },
        });

        await database
            .updateTable('source_resources')
            .set({ enabled: false, updated_at: now })
            .where('source_instance_id', '=', sourceInstance.id)
            .where('resource_type', 'in', ['standings', 'fixtures'])
            .execute();

        for (const target of group.targets) {
            const context = contextByCompetition.get(target.competitionId)!;
            const externalId = `${target.divisionExtId ?? target.competitionId}:standings`;
            const shared = {
                sourceInstanceId: sourceInstance.id,
                adapterVersion: TARGET_ADAPTER_VERSION,
                refreshPolicy: {
                    cadence: target.isHistorical ? 'historical' : 'daily',
                    isHistorical: target.isHistorical,
                },
                enabled: true,
                leagueId: context.leagueId,
                seasonId: context.seasonId,
                competitionId: target.competitionId,
            } as const;

            await upsertSourceResource(database, {
                ...shared,
                resourceType: 'standings',
                externalId,
                name: target.divisionName,
                publicUrl: target.url,
            });
            if (target.fixturesUrl) {
                await upsertSourceResource(database, {
                    ...shared,
                    resourceType: 'fixtures',
                    externalId: `${target.divisionExtId ?? target.competitionId}:fixtures`,
                    name: `${target.divisionName} fixtures`,
                    publicUrl: target.fixturesUrl,
                });
            }
        }
    }
}

export async function loadPersistedScrapeTargets(
    database: Kysely<Database>,
): Promise<ScrapeTarget[]> {
    const rows = await database
        .selectFrom('source_resources as standings')
        .innerJoin('source_instances as instance', 'instance.id', 'standings.source_instance_id')
        .innerJoin('competitions as competition', 'competition.id', 'standings.competition_id')
        .innerJoin('seasons as season', 'season.id', 'competition.season_id')
        .innerJoin('leagues as league', 'league.id', 'season.league_id')
        .leftJoin('source_resources as fixtures', (join) =>
            join
                .onRef('fixtures.source_instance_id', '=', 'standings.source_instance_id')
                .onRef('fixtures.competition_id', '=', 'standings.competition_id')
                .on('fixtures.resource_type', '=', 'fixtures')
                .on('fixtures.enabled', '=', true),
        )
        .select([
            'standings.id as resourceId',
            'standings.external_id as resourceExternalId',
            'standings.name as resourceName',
            'standings.public_url as standingsUrl',
            'standings.competition_id as competitionId',
            'instance.platform_id as platformId',
            'instance.adapter_key as adapterKey',
            'instance.base_url as instanceBaseUrl',
            'instance.config as instanceConfig',
            'league.name as leagueName',
            'season.is_active as seasonActive',
            'fixtures.public_url as fixturesUrl',
        ])
        .where('standings.resource_type', '=', 'standings')
        .where('standings.enabled', '=', true)
        .where('instance.enabled', '=', true)
        .where('instance.adapter_key', 'in', ['tt365', 'ttleagues'])
        .where('competition.deleted_at', 'is', null)
        .orderBy('standings.id', 'asc')
        .execute() as PersistedTargetRow[];

    const targets = rows.map(persistedScrapeTargetFromRow);
    const deduped = new Map<string, ScrapeTarget>();
    for (const target of targets) {
        const key = `${target.platformType}:${target.competitionId}:${target.url}`;
        deduped.set(key, target);
    }
    return [...deduped.values()];
}
