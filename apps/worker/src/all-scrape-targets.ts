import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { bootstrap, type BootstrapOptions, type ScrapeTarget } from './bootstrap.js';
import { bootstrapNationalTTLeagues } from './national-ttleagues.js';
import { bootstrapTerritorySourceCatalog } from './territory-source-catalog.js';

interface TargetLogger {
    info?: (message: string) => void;
    warn?: (message: string) => void;
}

export interface ResolveAllScrapeTargetsOptions extends BootstrapOptions {
    logger?: TargetLogger;
}

export async function resolveAllScrapeTargets(
    db: Kysely<Database>,
    options: ResolveAllScrapeTargetsOptions = {},
): Promise<ScrapeTarget[]> {
    const territoryCatalog = await bootstrapTerritorySourceCatalog(db, { logger: options.logger });
    const configuredTargets = await bootstrap(db, options);

    const configuredLeagueNames = new Set(configuredTargets.map((target) => target.leagueName));
    const missingTerritoryTargets = territoryCatalog.enabledLegacyLeagueNames.filter(
        (leagueName) => !configuredLeagueNames.has(leagueName),
    );
    if (missingTerritoryTargets.length > 0) {
        throw new Error(
            'Enabled territory sources have no configured scrape targets: '
            + missingTerritoryTargets.join(', '),
        );
    }

    const nationalTargets = await bootstrapNationalTTLeagues(db, {
        includeHistory: options.includeHistory,
        logger: options.logger,
    });
    return [...configuredTargets, ...nationalTargets];
}
