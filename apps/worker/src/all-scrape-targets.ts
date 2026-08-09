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
            target.isHistorical ? 'historical' : 'current',
        ].join('|');
        if (seen.has(identity)) {
            throw new Error(`Duplicate configured scrape target resolved: ${identity}`);
        }
        seen.add(identity);
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
    await linkTerritoryLeagueResources(db);

    const configuredLeagueNames = new Set(configuredTargets.map((target) => target.leagueName));
    const requestedLeagueNames = options.leagueNames && options.leagueNames.length > 0
        ? new Set(options.leagueNames)
        : null;
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
    return [...configuredTargets, ...nationalTargets];
}

export const __internal = {
    mergeLegacyAndTerritoryLeagueConfigs,
};
