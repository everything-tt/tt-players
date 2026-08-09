import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import {
    bootstrapLeagueConfigs,
    readLegacyLeagueConfigs,
    type BootstrapOptions,
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

export async function resolveAllScrapeTargets(
    db: Kysely<Database>,
    options: ResolveAllScrapeTargetsOptions = {},
): Promise<ScrapeTarget[]> {
    const territoryCatalog = await bootstrapTerritorySourceCatalog(db, { logger: options.logger });
    const territoryLeagueConfigs = readTerritoryLeagueConfigs();
    const territoryOwnedExternalIds = new Set(readTerritoryOwnedLeagueExternalIds());
    const legacyLeagueConfigs = readLegacyLeagueConfigs().filter(
        (league) => !territoryOwnedExternalIds.has(league.externalId),
    );

    const configuredTargets = await bootstrapLeagueConfigs(
        db,
        [...legacyLeagueConfigs, ...territoryLeagueConfigs],
        options,
    );
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

    const nationalTargets = await bootstrapNationalTTLeagues(db, {
        includeHistory: options.includeHistory,
        logger: options.logger,
    });
    return [...configuredTargets, ...nationalTargets];
}
