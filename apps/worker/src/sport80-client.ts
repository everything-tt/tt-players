import { runSourceRateLimited } from './source-rate-limit.js';

const SPORT80_API_BASE = 'https://admin-tte-rankings.sport80.com/api';
const SPORT80_PUBLIC_BASE = 'https://tabletennisengland.sport80.com/public/rankings';
const SPORT80_API_TOKEN = process.env['SPORT80_API_TOKEN'] ?? '14ced0f3-421f-4acf-94ad-cc63a371af19';
const SPORT80_SOURCE_RATE_KEY = 'sport80';
const SPORT80_FETCH_MIN_INTERVAL_MS = Number(process.env['SPORT80_FETCH_MIN_INTERVAL_MS'] ?? '500');
const SPORT80_FETCH_TIMEOUT_MS = Number(process.env['SPORT80_FETCH_TIMEOUT_MS'] ?? '30000');

export interface Sport80TableResponse<T> {
    data: T[];
    items_per_page?: number;
    page?: number;
    total: number;
}

export interface Sport80EventTableRow {
    id: number;
    date: string;
    name: string;
    category: string;
}

export interface Sport80EventResultTableRow {
    id: number;
    date_and_time: string | null;
    round: string | { type?: string } | null;
    home: string;
    away: string;
}

export interface Sport80FeaturedCategoryResponse {
    cards?: Array<{
        title?: string;
        actions?: Array<{ route?: string }>;
    }>;
}

export interface Sport80FilterItem {
    text?: string;
    label?: string;
    value: number | string;
}

export interface Sport80TableFilter {
    name?: string;
    key?: string;
    items?: Sport80FilterItem[];
}

export interface Sport80RankingTableMetadata {
    title?: string;
    filters?: Sport80TableFilter[];
}

export interface Sport80RankingTableRow {
    id: number;
    rank: number | string | null;
    name: unknown;
    county_country?: string | null;
    points?: number | string | null;
    inactive_periods?: number | string | null;
    is_initial_rating?: string | boolean | null;
    action?: unknown;
}

export const sport80Urls = {
    eventsTable(page: number, limit: number): string {
        return `${SPORT80_API_BASE}/events/table?data=1&p=${page}&l=${limit}&sort=&d=asc&s=&st=`;
    },
    eventResultsTable(eventId: string | number): string {
        return `${SPORT80_API_BASE}/events/${eventId}/table?data=1`;
    },
    featuredCategories(): string {
        return `${SPORT80_API_BASE}/categories/featured`;
    },
    rankingMetadata(categoryEndpointId: string | number): string {
        return `${SPORT80_API_BASE}/categories/${categoryEndpointId}/rankings/table`;
    },
    rankingTable(categoryEndpointId: string | number): string {
        return `${SPORT80_API_BASE}/categories/${categoryEndpointId}/rankings/table?data=1`;
    },
    publicEvent(eventId: string | number): string {
        return `${SPORT80_PUBLIC_BASE}/results/${eventId}`;
    },
};

function retryAfterMs(response: Response): number {
    const value = response.headers.get('retry-after');
    if (!value) return 30_000;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 30_000 : Math.max(0, timestamp - Date.now());
}

async function fetchSport80(url: string, init: RequestInit): Promise<Response> {
    return runSourceRateLimited(
        SPORT80_SOURCE_RATE_KEY,
        Math.max(0, SPORT80_FETCH_MIN_INTERVAL_MS),
        Math.max(1_000, SPORT80_FETCH_TIMEOUT_MS + 10_000),
        () => fetch(url, {
            ...init,
            signal: AbortSignal.timeout(SPORT80_FETCH_TIMEOUT_MS),
        }),
        (response) => response.status === 429 ? retryAfterMs(response) : 0,
    );
}

function sport80Headers(): Record<string, string> {
    return {
        'x-api-token': SPORT80_API_TOKEN,
        'x-requested-with': 'XMLHttpRequest',
        'x-keep-session': 'keepsession',
    };
}

async function postSport80Json<T>(url: string, body: unknown): Promise<T> {
    const res = await fetchSport80(url, {
        method: 'POST',
        headers: {
            'content-type': 'application/json',
            ...sport80Headers(),
        },
        body: JSON.stringify(body),
    });

    if (!res.ok) {
        throw new Error(`Sport80 HTTP ${res.status} ${res.statusText} for ${url}`);
    }

    return res.json() as Promise<T>;
}

export async function fetchSport80EventsPage(options: {
    page: number;
    limit: number;
    category?: number;
}): Promise<Sport80TableResponse<Sport80EventTableRow>> {
    const filters = options.category == null ? {} : { category: options.category };
    return postSport80Json<Sport80TableResponse<Sport80EventTableRow>>(
        sport80Urls.eventsTable(options.page, options.limit),
        { columns: [], filters },
    );
}

export async function fetchSport80EventResults(
    eventId: string | number,
): Promise<Sport80TableResponse<Sport80EventResultTableRow>> {
    return postSport80Json<Sport80TableResponse<Sport80EventResultTableRow>>(
        sport80Urls.eventResultsTable(eventId),
        { columns: [] },
    );
}

export async function fetchSport80FeaturedCategories(): Promise<Sport80FeaturedCategoryResponse> {
    const url = sport80Urls.featuredCategories();
    const res = await fetchSport80(url, { headers: sport80Headers() });

    if (!res.ok) {
        throw new Error(`Sport80 HTTP ${res.status} ${res.statusText} for ${url}`);
    }

    return res.json() as Promise<Sport80FeaturedCategoryResponse>;
}

export async function fetchSport80RankingMetadata(
    categoryEndpointId: string | number,
): Promise<Sport80RankingTableMetadata> {
    return postSport80Json<Sport80RankingTableMetadata>(
        sport80Urls.rankingMetadata(categoryEndpointId),
        { columns: [] },
    );
}

export async function fetchSport80RankingTable(options: {
    categoryEndpointId: string | number;
    period: string | number;
    subcategory: string | number;
    showRatingsList: 0 | 1;
}): Promise<Sport80TableResponse<Sport80RankingTableRow>> {
    return postSport80Json<Sport80TableResponse<Sport80RankingTableRow>>(
        sport80Urls.rankingTable(options.categoryEndpointId),
        {
            columns: [],
            filters: {
                period: Number(options.period),
                subcategory: Number(options.subcategory),
                show_ratings_list: options.showRatingsList,
            },
        },
    );
}
