import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { bootstrap, type BootstrapOptions, type ScrapeTarget } from './bootstrap.js';
import { bootstrapNationalTTLeagues } from './national-ttleagues.js';

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
    const configuredTargets = await bootstrap(db, options);
    const nationalTargets = await bootstrapNationalTTLeagues(db, {
        includeHistory: options.includeHistory,
        logger: options.logger,
    });
    return [...configuredTargets, ...nationalTargets];
}
