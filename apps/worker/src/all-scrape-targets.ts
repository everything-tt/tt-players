import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { bootstrap, type BootstrapOptions, type ScrapeTarget } from './bootstrap.js';
import { bootstrapNationalTTLeagues } from './national-ttleagues.js';
import { bootstrapTerritorySourceCatalog } from './territory-source-catalog.js';
import { bootstrapTerritoryTT365Targets } from './territory-tt365.js';

interface TargetLogger {
    info?: (message: string) => void;
    warn?: (message: string) => void;
}

export interface ResolveAllScrapeTargetsOptions extends BootstrapOptions {
    logger?: TargetLogger;
}

function dedupeScrapeTargets(targets: ScrapeTarget[]): ScrapeTarget[] {
    const seen = new Set<string>();
    return targets.filter((target) => {
        const key = `${target.platformType}:${target.competitionId}:${target.url}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

export async function resolveAllScrapeTargets(
    db: Kysely<Database>,
    options: ResolveAllScrapeTargetsOptions = {},
): Promise<ScrapeTarget[]> {
    await bootstrapTerritorySourceCatalog(db, { logger: options.logger });
    const territoryTT365Targets = await bootstrapTerritoryTT365Targets(db);
    const configuredTargets = await bootstrap(db, options);
    const nationalTargets = await bootstrapNationalTTLeagues(db, {
        includeHistory: options.includeHistory,
        logger: options.logger,
    });
    return dedupeScrapeTargets([
        ...configuredTargets,
        ...territoryTT365Targets,
        ...nationalTargets,
    ]);
}
