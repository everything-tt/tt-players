import { quickAddJob, runMigrations, runOnce } from 'graphile-worker';
import { db } from '@tt-players/db';
import type { ScrapeTarget } from './bootstrap.js';
import { resolveAllScrapeTargets } from './all-scrape-targets.js';
import { taskList } from './task-list.js';
import dotenv from 'dotenv';
import { sql } from 'kysely';
import { runStartupRecovery } from './startup-recovery.js';

dotenv.config();

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_DEFERRED_WAIT_MS = 60 * 1000;
const SCRAPE_JOB_SPEC = { maxAttempts: 1 };

async function applyHistoricalCooldown(
    targets: ScrapeTarget[],
    cooldownDays: number,
): Promise<ScrapeTarget[]> {
    if (cooldownDays <= 0) return targets;

    const historicalTargets = targets.filter((target) => target.isHistorical);
    if (historicalTargets.length === 0) return targets;

    const competitionIds = Array.from(
        new Set(historicalTargets.map((target) => target.competitionId)),
    );
    const competitions = await db
        .selectFrom('competitions')
        .select(['id', 'last_scraped_at'])
        .where('id', 'in', competitionIds)
        .execute();

    const byCompetitionId = new Map(
        competitions.map((competition) => [competition.id, competition.last_scraped_at]),
    );
    const cutoffMs = Date.now() - (cooldownDays * DAY_MS);

    return targets.filter((target) => {
        if (!target.isHistorical) return true;
        const lastScrapedAt = byCompetitionId.get(target.competitionId);
        if (!lastScrapedAt) return true;
        return new Date(lastScrapedAt).getTime() < cutoffMs;
    });
}

interface QueueStatus {
    total: number;
    runnable: number;
    deferred: number;
    exhausted: number;
    nextRunAt: Date | null;
}

async function getQueueStatus(): Promise<QueueStatus> {
    const result = await sql<{
        total: string;
        runnable: string;
        deferred: string;
        exhausted: string;
        next_run_at: Date | null;
    }>`
        select
            count(*)::text as total,
            count(*) filter (where attempts < max_attempts and run_at <= now())::text as runnable,
            count(*) filter (where attempts < max_attempts and run_at > now())::text as deferred,
            count(*) filter (where attempts >= max_attempts)::text as exhausted,
            min(run_at) filter (where attempts < max_attempts and run_at > now()) as next_run_at
        from graphile_worker.jobs
    `.execute(db);

    const row = result.rows[0];
    return {
        total: Number(row?.total ?? 0),
        runnable: Number(row?.runnable ?? 0),
        deferred: Number(row?.deferred ?? 0),
        exhausted: Number(row?.exhausted ?? 0),
        nextRunAt: row?.next_run_at ?? null,
    };
}

async function main() {
    const DATABASE_URL = process.env['DATABASE_URL'];
    if (!DATABASE_URL) {
        throw new Error('DATABASE_URL is not set');
    }
    const includeHistory = process.env['SCRAPE_INCLUDE_HISTORY'] === '1';
    const historyCooldownDays = Number(
        process.env['SCRAPE_HISTORY_COOLDOWN_DAYS'] ?? '180',
    );
    const waitForDeferredRetries = process.env['SCRAPE_WAIT_FOR_DEFERRED_RETRIES'] === '1';

    console.log('🚀 Starting one-off scrape...');
    console.log(
        `🔎 History mode: ${includeHistory ? `enabled (cooldown ${historyCooldownDays}d)` : 'disabled'}`,
    );
    console.log(
        `⏱️ Deferred retries: ${waitForDeferredRetries ? 'wait until runnable' : 'do not wait'}`,
    );

    await runMigrations({ connectionString: DATABASE_URL });
    await runStartupRecovery(db, (message) => console.log(message));

    const targets = await resolveAllScrapeTargets(db, {
        includeHistory,
        logger: {
            info: (message) => console.log(message),
            warn: (message) => console.warn(message),
        },
    });
    const eligibleTargets = includeHistory
        ? await applyHistoricalCooldown(targets, historyCooldownDays)
        : targets.filter((target) => !target.isHistorical);

    console.log(
        `✅ Bootstrapped ${targets.length} targets. Eligible for this run: ${eligibleTargets.length}`,
    );

    for (const target of eligibleTargets) {
        console.log(`  → Queuing standings: ${target.leagueName} - ${target.divisionName}`);
        await quickAddJob({ connectionString: DATABASE_URL }, 'scrapeUrlTask', {
            url: target.url,
            tenantHost: target.tenantHost,
            platformId: target.platformId,
            platformType: target.platformType,
            competitionId: target.competitionId,
            tt365DataType: target.platformType === 'tt365' ? 'standings' : undefined,
        }, SCRAPE_JOB_SPEC);

        if (target.platformType === 'tt365' && target.fixturesUrl) {
            console.log(`  → Queuing fixtures:  ${target.leagueName} - ${target.divisionName}`);
            await quickAddJob({ connectionString: DATABASE_URL }, 'scrapeUrlTask', {
                url: target.fixturesUrl,
                platformId: target.platformId,
                platformType: target.platformType,
                competitionId: target.competitionId,
                tt365DataType: 'fixtures',
            }, SCRAPE_JOB_SPEC);
        }

        if (target.platformType === 'ttleagues' && target.divisionExtId) {
            console.log(`  → Queuing matches:   ${target.leagueName} - ${target.divisionName}`);
            await quickAddJob({ connectionString: DATABASE_URL }, 'scrapeMatchesTask', {
                divisionId: target.divisionExtId,
                tenantHost: target.tenantHost,
                platformId: target.platformId,
                platformType: target.platformType,
                competitionId: target.competitionId,
            }, SCRAPE_JOB_SPEC);
        }
    }

    console.log('✨ Jobs queued. Starting worker to process all jobs...');

    while (true) {
        const status = await getQueueStatus();

        if (status.total === 0) break;

        if (status.runnable === 0) {
            if (!waitForDeferredRetries || status.deferred === 0) {
                const nextRunAt = status.nextRunAt?.toISOString() ?? 'n/a';
                console.log(
                    `⏭️ No runnable jobs. Remaining in queue: total=${status.total}, deferred=${status.deferred}, exhausted=${status.exhausted}, next_run_at=${nextRunAt}`,
                );
                break;
            }

            const nextRunMs = status.nextRunAt
                ? status.nextRunAt.getTime() - Date.now()
                : MAX_DEFERRED_WAIT_MS;
            const waitMs = Math.max(
                1000,
                Math.min(MAX_DEFERRED_WAIT_MS, nextRunMs || MAX_DEFERRED_WAIT_MS),
            );
            const nextRunAt = status.nextRunAt?.toISOString() ?? 'n/a';

            console.log(
                `⏳ No runnable jobs yet. deferred=${status.deferred}, next_run_at=${nextRunAt}, waiting ${Math.round(waitMs / 1000)}s...`,
            );
            await new Promise((resolve) => setTimeout(resolve, waitMs));
            continue;
        }

        console.log(
            `📦 Processing runnable=${status.runnable} (total=${status.total}, deferred=${status.deferred}, exhausted=${status.exhausted})...`,
        );
        await runOnce({
            connectionString: DATABASE_URL,
            taskList,
        });
    }

    const finalStatus = await getQueueStatus();
    if (finalStatus.total > 0) {
        const nextRunAt = finalStatus.nextRunAt?.toISOString() ?? 'n/a';
        console.log(
            `⚠️ Exiting with queued jobs remaining: total=${finalStatus.total}, deferred=${finalStatus.deferred}, exhausted=${finalStatus.exhausted}, next_run_at=${nextRunAt}`,
        );
    }

    console.log('🏁 Scraping and processing complete.');
    await db.destroy();
    process.exit(0);
}

main().catch((error) => {
    console.error('❌ Scrape failed:', error);
    process.exit(1);
});
