import type { Task } from 'graphile-worker';
import { db } from '@tt-players/db';
import {
    fetchSport80FeaturedCategories,
    fetchSport80RankingMetadata,
    type Sport80FilterItem,
    type Sport80TableFilter,
} from '../sport80-client.js';
import {
    upsertSport80Platform,
    upsertSport80RankingCategory,
    upsertSport80RankingPeriod,
} from '../sport80-loader.js';

export interface ScrapeSport80RankingsDiscoveryPayload {
    allPeriods?: boolean;
    maxPeriods?: number;
    includeRatingsList?: boolean;
}

const SCRAPE_JOB_SPEC = { maxAttempts: 1 };

function extractCategoryEndpointId(route: string | undefined): string | null {
    const match = route?.match(/\/public\/rankings\/(\d+)/);
    return match?.[1] ?? null;
}

function filterByName(filters: Sport80TableFilter[] | undefined, name: string): Sport80TableFilter | null {
    return filters?.find((filter) => filter.name === name || filter.key === name) ?? null;
}

function itemLabel(item: Sport80FilterItem): string {
    return item.text ?? item.label ?? String(item.value);
}

function parseSport80PeriodEndDate(label: string): string | null {
    const dateText = label.split(',').at(-1)?.trim();
    if (!dateText) return null;
    const timestamp = Date.parse(`${dateText} UTC`);
    if (Number.isNaN(timestamp)) return null;
    return new Date(timestamp).toISOString().slice(0, 10);
}

export const scrapeSport80RankingsDiscoveryTask: Task = async (payload, helpers) => {
    const {
        allPeriods = false,
        maxPeriods,
        includeRatingsList = true,
    } = payload as ScrapeSport80RankingsDiscoveryPayload;
    const periodLimit = allPeriods ? undefined : (maxPeriods ?? 1);

    const platformId = await upsertSport80Platform(db);
    const featured = await fetchSport80FeaturedCategories();
    const endpointIds = new Set<string>();

    for (const card of featured.cards ?? []) {
        for (const action of card.actions ?? []) {
            const endpointId = extractCategoryEndpointId(action.route);
            if (endpointId) endpointIds.add(endpointId);
        }
    }

    helpers.logger.info(
        `scrapeSport80RankingsDiscoveryTask: discovered ${endpointIds.size} ranking endpoints`,
    );

    const queued = new Set<string>();

    for (const categoryEndpointId of endpointIds) {
        const metadata = await fetchSport80RankingMetadata(categoryEndpointId);
        const periods = filterByName(metadata.filters, 'period')?.items ?? [];
        const subcategories = filterByName(metadata.filters, 'subcategory')?.items ?? [];
        const selectedPeriods = periodLimit == null ? periods : periods.slice(0, periodLimit);

        for (const subcategory of subcategories) {
            const subcategoryId = String(subcategory.value);
            const subcategoryName = itemLabel(subcategory);
            await upsertSport80RankingCategory(db, platformId, subcategoryId, subcategoryName);

            for (const period of selectedPeriods) {
                const periodId = String(period.value);
                const periodLabel = itemLabel(period);
                await upsertSport80RankingPeriod(
                    db,
                    platformId,
                    periodId,
                    periodLabel,
                    parseSport80PeriodEndDate(periodLabel),
                );

                const listKinds: Array<0 | 1> = includeRatingsList ? [0, 1] : [0];
                for (const showRatingsList of listKinds) {
                    const key = `${subcategoryId}:${periodId}:${showRatingsList}`;
                    if (queued.has(key)) continue;
                    queued.add(key);

                    await helpers.addJob('scrapeSport80RankingTableTask', {
                        categoryEndpointId,
                        subcategoryId,
                        subcategoryName,
                        periodId,
                        periodLabel,
                        periodEndDate: parseSport80PeriodEndDate(periodLabel),
                        showRatingsList,
                    }, SCRAPE_JOB_SPEC);
                }
            }
        }
    }

    helpers.logger.info(`scrapeSport80RankingsDiscoveryTask: queued ${queued.size} ranking table jobs`);
};
