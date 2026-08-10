import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import {
    bootstrapLeagueConfigs,
    readLegacyLeagueConfigs,
    type BootstrapOptions,
    type LeagueConfig,
    type ScrapeTarget,
} from './bootstrap.js';
import { bootstrapNationalTTLeagues } from './national-ttleagues.js';
import {
    bootstrapTerritorySourceCatalog,
    linkTerritoryLeagueResources,
    readTerritoryLeagueConfigs,
    readTerritoryOwnedLeagueExternalIds,
} from './territory-source-catalog.js';

interface TargetLogger {
    info?: (message: string) => void;
    warn?: (message: string) => void;
}

export interface ResolveAllScrapeTargetsOptions extends BootstrapOptions {
    logger?: TargetLogger;
}

function mergeLegacyAndTerritoryLeagueConfigs(
    legacyLeagueConfigs: LeagueConfig[],
    territoryLeagueConfigs: LeagueConfig[],
    territoryOwnedExternalIds: Set<string>,
): LeagueConfig[] {
    const territoryByExternalId = new Map(
        territoryLeagueConfigs.map((league) => [league.externalId, league] as const),
    );
    const representedExternalIds = new Set<string>();
    const merged: LeagueConfig[] = [];

    // Replace migrated leagues in place so target ordering remains identical to the
    // effective legacy catalog. Territory-owned-but-disabled leagues deliberately
    // suppress the legacy fallback.
    for (const legacyLeague of legacyLeagueConfigs) {
        const territoryLeague = territoryByExternalId.get(legacyLeague.externalId);
        if (territoryLeague) {
            merged.push(territoryLeague);
            representedExternalIds.add(territoryLeague.externalId);
            continue;
        }
        if (territoryOwnedExternalIds.has(legacyLeague.externalId)) continue;
        merged.push(legacyLeague);
    }

    // Allow future territory-native leagues that never existed in the legacy files.
    for (const territoryLeague of territoryLeagueConfigs) {
        if (representedExternalIds.has(territoryLeague.externalId)) continue;
        merged.push(territoryLeague);
    }

    return merged;
}

function assertNoDuplicateConfiguredTargets(targets: ScrapeTarget[]): void {
    const seen = new Set<string>();
    for (const target of targets) {
        const identity = [
            target.platformType,
            target.competitionId,
            target.divisionExtId,
            target.url,
            target.fixturesUrl ?? '',
            target.isHistorical ? 'historical' : 'current',
        ].join('|');
        if (seen.has(identity)) {
            throw new Error(`Duplicate configured scrape target resolved: ${identity}`);
        }
        seen.add(identity);
    }
}

function physicalRequestIdentities(target: ScrapeTarget): string[] {
    const tenant = target.tenantHost ?? '';
    const identities = [
        [target.platformType, 'standings', tenant, target.url].join('|'),
    ];
    if (target.fixturesUrl) {
        identities.push([
            target.platformType,
            'fixtures',
            tenant,
            target.fixturesUrl,
        ].join('|'));
    }
    if (target.platformType === 'ttleagues') {
        identities.push([
            target.platformType,
            'matches',
            tenant,
            target.divisionExtId,
        ].join('|'));
    }
    return identities;
}

function assertNoDuplicatePhysicalRequests(targets: ScrapeTarget[]): void {
    const owners = new Map<string, ScrapeTarget>();
    for (const target of targets) {
        for (const identity of physicalRequestIdentities(target)) {
            const existing = owners.get(identity);
            if (existing) {
                throw new Error(
                    `Duplicate physical scrape request resolved: ${identity}; `
                    + `${existing.leagueName}/${existing.competitionId} and `
                    + `${target.leagueName}/${target.competitionId}`,
                );
            }
            owners.set(identity, target);
        }
    }
}

function assertEnabledTerritoryLeagueTargets(
    territoryLeagueConfigs: LeagueConfig[],
    targets: ScrapeTarget[],
    requestedLeagueNames: Set<string> | null,
): void {
    const resolved = new Set(
        targets.map((target) => `${target.platformType}|${target.leagueName}`),
    );
    const missing = territoryLeagueConfigs.filter((league) => {
        if (requestedLeagueNames && !requestedLeagueNames.has(league.leagueName)) return false;
        return !resolved.has(`${league.platform}|${league.leagueName}`);
    });
    if (missing.length > 0) {
        throw new Error(
            'Enabled territory league-config sources have no operational scrape targets: '
            + missing.map((league) => `${league.leagueName} (${league.externalId})`).join(', '),
        );
    }
}

export async function resolveConfiguredLeagueTargets(
    db: Kysely<Database>,
    options: ResolveAllScrapeTargetsOptions = {},
): Promise<ScrapeTarget[]> {
    const territoryCatalog = await bootstrapTerritorySourceCatalog(db, { logger: options.logger });
    const territoryLeagueConfigs = readTerritoryLeagueConfigs();
    const territoryOwnedExternalIds = new Set(readTerritoryOwnedLeagueExternalIds());
    const configuredLeagueConfigs = mergeLegacyAndTerritoryLeagueConfigs(
        readLegacyLeagueConfigs(),
        territoryLeagueConfigs,
        territoryOwnedExternalIds,
    );

    const configuredTargets = await bootstrapLeagueConfigs(db, configuredLeagueConfigs, options);
    assertNoDuplicateConfiguredTargets(configuredTargets);
    assertNoDuplicatePhysicalRequests(configuredTargets);

    const requestedLeagueNames = options.leagueNames && options.leagueNames.length > 0
        ? new Set(options.leagueNames)
        : null;
    assertEnabledTerritoryLeagueTargets(
        territoryLeagueConfigs,
        configuredTargets,
        requestedLeagueNames,
    );
    await linkTerritoryLeagueResources(db);

    const configuredLeagueNames = new Set(configuredTargets.map((target) => target.leagueName));
    const requiredLegacyLeagueNames = territoryCatalog.enabledLegacyLeagueNames.filter(
        (leagueName) => !requestedLeagueNames || requestedLeagueNames.has(leagueName),
    );
    const missingTerritoryTargets = requiredLegacyLeagueNames.filter(
        (leagueName) => !configuredLeagueNames.has(leagueName),
    );
    if (missingTerritoryTargets.length > 0) {
        throw new Error(
            'Enabled territory legacy-config sources have no operational scrape targets: '
            + missingTerritoryTargets.join(', '),
        );
    }

    return configuredTargets;
}

export async function resolveAllScrapeTargets(
    db: Kysely<Database>,
    options: ResolveAllScrapeTargetsOptions = {},
): Promise<ScrapeTarget[]> {
    const configuredTargets = await resolveConfiguredLeagueTargets(db, options);
    const nationalTargets = await bootstrapNationalTTLeagues(db, {
        includeHistory: options.includeHistory,
        logger: options.logger,
    });
    const targets = [...configuredTargets, ...nationalTargets];
    assertNoDuplicatePhysicalRequests(targets);
    return targets;
}

export const __internal = {
    mergeLegacyAndTerritoryLeagueConfigs,
    assertNoDuplicateConfiguredTargets,
    assertNoDuplicatePhysicalRequests,
    assertEnabledTerritoryLeagueTargets,
};
