import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import { extractAndStore, storeScrapePayload } from '../extractor.js';
import { fetchWithTT365Policy } from '../tt365-http.js';

export interface ScrapeUrlPayload {
    url: string;
    tenantHost?: string | null;
    platformId: string;
    platformType: 'tt365' | 'ttleagues';
    competitionId: string;
    tt365DataType?: 'standings' | 'fixtures' | 'matchcard' | 'playerstats';
    matchExternalId?: string;
    playerExternalId?: string;
}

const SCRAPE_RETRY_DELAY_MS = Number(
    process.env['SCRAPE_RETRY_DELAY_MS'] ?? '10000',
);

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractAntiForgeryToken(html: string): string | null {
    const tokenMatch = html.match(
        /name="__RequestVerificationToken"[^>]*value="([^"]+)"/i,
    );
    return tokenMatch?.[1] ?? null;
}

function extractAjaxMatchCardPath(html: string): string | null {
    const pathMatch = html.match(
        /['"]url['"]\s*:\s*['"]([^'"]*\/Results\/Ajax\/[^'"]*\/MatchCard\/\d+)['"]/i,
    );
    return pathMatch?.[1] ?? null;
}

function buildCookieHeader(setCookies: string[]): string {
    return setCookies
        .map((cookie) => cookie.split(';', 1)[0])
        .filter(Boolean)
        .join('; ');
}

export function isTT365MatchCardPayload(html: string): boolean {
    if (!html.includes('CardSummary')) return false;

    return html.includes('CardResults')
        || (
            html.includes('fixtureDetails')
            && html.includes('resultCard')
            && html.includes('results')
        );
}

async function extractAndStoreTT365MatchCard(url: string, platformId: string): Promise<string> {
    const pageRes = await fetchWithTT365Policy(url);
    if (!pageRes.ok) {
        throw new Error(`HTTP ${pageRes.status} ${pageRes.statusText} when fetching ${url}`);
    }

    const pageHtml = await pageRes.text();
    const token = extractAntiForgeryToken(pageHtml);
    const ajaxPath = extractAjaxMatchCardPath(pageHtml);

    if (!token || !ajaxPath) {
        throw new Error(`Could not resolve TT365 match-card ajax endpoint for ${url}`);
    }

    const ajaxUrl = new URL(ajaxPath, url).toString();
    const setCookies = pageRes.headers.getSetCookie?.() ?? [];
    const cookieHeader = buildCookieHeader(setCookies);

    const ajaxRes = await fetchWithTT365Policy(ajaxUrl, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
            'x-requested-with': 'XMLHttpRequest',
            referer: url,
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
        },
        body: new URLSearchParams({
            __RequestVerificationToken: token,
        }),
    });

    if (!ajaxRes.ok) {
        throw new Error(`HTTP ${ajaxRes.status} ${ajaxRes.statusText} when fetching ${ajaxUrl}`);
    }

    const ajaxHtml = await ajaxRes.text();
    if (!isTT365MatchCardPayload(ajaxHtml)) {
        throw new Error(`TT365 ajax match-card payload not found for ${url}`);
    }

    return storeScrapePayload(url, platformId, ajaxHtml, db);
}

/**
 * Graphile Worker task: Phase 1 (Extract).
 *
 * Fetches a URL, hashes the body, upserts into raw_scrape_logs,
 * then chains a processLogTask for the resulting log row.
 */
export const scrapeUrlTask: Task = async (payload, helpers) => {
    const {
        url,
        tenantHost,
        platformId,
        platformType,
        competitionId,
        tt365DataType,
        matchExternalId,
        playerExternalId,
    } = payload as ScrapeUrlPayload;

    helpers.logger.info(`scrapeUrlTask: fetching ${url}`);

    const isTT365MatchCard =
        platformType === 'tt365' && tt365DataType === 'matchcard';
    const requestInit: RequestInit = platformType === 'ttleagues' && tenantHost
        ? {
            headers: {
                Tenant: tenantHost,
                Entry: '1',
            },
        }
        : {};

    const extractOnce = async (): Promise<string> => (
        isTT365MatchCard
            ? extractAndStoreTT365MatchCard(url, platformId)
            : extractAndStore(url, platformId, db, requestInit)
    );

    let logId: string;
    try {
        logId = await extractOnce();
    } catch {
        helpers.logger.info(
            `scrapeUrlTask: first attempt failed for ${url}; retrying in ${SCRAPE_RETRY_DELAY_MS}ms`,
        );
        await sleep(SCRAPE_RETRY_DELAY_MS);
        logId = await extractOnce();
    }

    helpers.logger.info(`scrapeUrlTask: stored log ${logId}, queuing processLogTask`);

    await helpers.addJob('processLogTask', {
        logId,
        competitionId,
        platformId,
        platformType,
        tt365DataType,
        matchExternalId,
        playerExternalId,
    });
};
