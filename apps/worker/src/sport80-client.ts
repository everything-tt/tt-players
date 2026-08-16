import { runSourceRateLimited } from './source-rate-limit.js';

const SPORT80_BASE_URL = 'https://tabletennisengland.sport80.com';
const SPORT80_SOURCE_RATE_KEY = 'sport80';
const SPORT80_MIN_INTERVAL_MS = Number(process.env['SPORT80_FETCH_MIN_INTERVAL_MS'] ?? '500');
const SPORT80_TIMEOUT_MS = Number(process.env['SPORT80_FETCH_TIMEOUT_MS'] ?? '30000');

export interface Sport80EventTableRow {
    id: number | string;
    date: string | null;
    name: string;
    category?: string | null;
    [key: string]: unknown;
}

export interface Sport80EventResultTableRow {
    id: number | string;
    date_and_time: string;
    round: string | number | null;
    home: string;
    away: string;
    [key: string]: unknown;
}

export interface Sport80TableResponse<T> {
    data: T[];
    total: number;
    [key: string]: unknown;
}

function authHeaders(): Record<string, string> {
    const token = process.env['SPORT80_ADMIN_BEARER_TOKEN'];
    return token ? { Authorization: `Bearer ${token}` } : {};
}

function retryAfterMs(response: Response): number {
    const value = response.headers.get('retry-after');
    if (!value) return 30_000;
    const seconds = Number(value);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1_000;
    const timestamp = Date.parse(value);
    return Number.isNaN(timestamp) ? 30_000 : Math.max(0, timestamp - Date.now());
}

async function fetchSport80(url: string): Promise<Response> {
    return runSourceRateLimited(
        SPORT80_SOURCE_RATE_KEY,
        Math.max(0, SPORT80_MIN_INTERVAL_MS),
        Math.max(1_000, SPORT80_TIMEOUT_MS + 10_000),
        () => fetch(url, {
            headers: {
                Accept: 'application/json',
                ...authHeaders(),
            },
            signal: AbortSignal.timeout(SPORT80_TIMEOUT_MS),
        }),
        (response) => response.status === 429 ? retryAfterMs(response) : 0,
    );
}

async function fetchJson<T>(url: string): Promise<T> {
    const response = await fetchSport80(url);
    if (!response.ok) {
        throw new Error(`Sport80 HTTP ${response.status} ${response.statusText} for ${url}`);
    }
    return response.json() as Promise<T>;
}

export const sport80Urls = {
    eventsTable: (params: { page?: number; limit?: number; category?: number } = {}) => {
        const query = new URLSearchParams({
            page: String(params.page ?? 0),
            limit: String(params.limit ?? 100),
            order: 'asc',
        });
        if (params.category != null) query.set('category', String(params.category));
        return `${SPORT80_BASE_URL}/api/public/rankings/events?${query}`;
    },
    eventResultsTable: (eventId: string | number) =>
        `${SPORT80_BASE_URL}/api/public/rankings/results/${eventId}`,
};

export async function fetchSport80EventsPage(
    params: { page?: number; limit?: number; category?: number } = {},
): Promise<Sport80TableResponse<Sport80EventTableRow>> {
    return fetchJson(sport80Urls.eventsTable(params));
}

export async function fetchSport80EventResults(
    eventId: string | number,
): Promise<Sport80TableResponse<Sport80EventResultTableRow>> {
    return fetchJson(sport80Urls.eventResultsTable(eventId));
}
