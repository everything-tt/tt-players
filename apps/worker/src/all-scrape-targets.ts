import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { resolveScrapeTargets, type BootstrapLogger, type ScrapeTarget } from './bootstrap.js';
import {
    bootstrapNationalTTLeagues,
    type NationalTTLeaguesSource,
} from './national-ttleagues.js';
import {
    loadPersistedScrapeTargets,
    persistConfiguredScrapeTargets,
} from './scrape-target-registry.js';

export interface ResolveAllScrapeTargetsOptions {
    logger?: BootstrapLogger;
    nationalSources?: NationalTTLeaguesSource[];
    throwOnNationalError?: boolean;
}

/**
 * Refresh configured + discovered target state into the durable source registry,
 * then project the currently enabled registry state back into legacy ScrapeTarget
 * jobs. This function performs upstream discovery and must run as Graphile work,
 * never during worker process bootstrap.
 */
export async function resolveAllScrapeTargets(
    db: Kysely<Database>,
    options: ResolveAllScrapeTargetsOptions = {},
): Promise<ScrapeTarget[]> {
    const configuredTargets = await resolveScrapeTargets(db);
    await persistConfiguredScrapeTargets(db, configuredTargets);

    const nationalTargets = await bootstrapNationalTTLeagues(db, {
        sources: options.nationalSources,
        logger: options.logger,
        throwOnError: options.throwOnNationalError ?? false,
    });
    const persistedTargets = await loadPersistedScrapeTargets(db);

    options.logger?.info(
        `Scrape target registry refreshed: ${configuredTargets.length} configured, `
        + `${nationalTargets.length} national discovered, ${persistedTargets.length} enabled persisted targets`,
    );
    return persistedTargets;
}
