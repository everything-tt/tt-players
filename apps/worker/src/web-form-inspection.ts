import { fetchPublicHttps, PublicHttpError, readBodyLimited } from './public-http.js';

export class WebFormInspectionError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'WebFormInspectionError';
        this.statusCode = statusCode;
    }
}

export interface WebFormInspection {
    provider: 'web_form';
    form_url: string;
    title: string | null;
    text: string;
}

const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;
const FETCH_TIMEOUT_MS = 20_000;

export function isWebFormUrl(input: string | null | undefined): boolean {
    if (!input) return false;
    try {
        const url = new URL(input.trim());
        return url.protocol === 'https:';
    } catch {
        return false;
    }
}

function decodeHtmlText(value: string): string {
    return value
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&apos;/gi, "'")
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&#(\d+);/g, (_match, decimal: string) => String.fromCodePoint(Number(decimal)))
        .replace(/&#x([0-9a-f]+);/gi, (_match, hex: string) => String.fromCodePoint(Number.parseInt(hex, 16)))
        .trim();
}

function extractVisibleText(html: string): string {
    const text = decodeHtmlText(html
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|section|article|header|footer|h[1-6]|li)>/gi, '\n')
        .replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();
    return text ? text.slice(0, MAX_TEXT_CHARS) : '';
}

function extractTitle(html: string): string | null {
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const ogMatch = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i);
    const candidates = [ogMatch?.[1], titleMatch?.[1]]
        .map((raw) => (raw ? decodeHtmlText(raw).replace(/\s+/g, ' ').trim() : ''))
        .filter((text) => text.length > 0);
    if (candidates.length === 0) return null;
    const best = candidates.sort((a, b) => b.length - a.length)[0];
    return best.slice(0, 200);
}

function publicHttpStatus(error: PublicHttpError): number {
    if (error.code === 'response_too_large') return 413;
    if (error.code === 'blocked_address' || error.code === 'invalid_url') return 400;
    return 502;
}

export async function inspectWebForm(
    input: string,
    fetcher: typeof fetch = fetch,
): Promise<WebFormInspection> {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        throw new WebFormInspectionError('Enter a valid form URL.', 400);
    }
    if (url.protocol !== 'https:') {
        throw new WebFormInspectionError('Only HTTPS form links are supported.', 400);
    }

    let response: Response;
    try {
        response = await fetchPublicHttps(url, {
            fetcher,
            timeoutMs: FETCH_TIMEOUT_MS,
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': 'TT-Players-Form-Inspector/1.0',
            },
        });
    } catch (error) {
        if (error instanceof PublicHttpError) {
            throw new WebFormInspectionError(error.message, publicHttpStatus(error));
        }
        throw error;
    }

    if (!response.ok) {
        throw new WebFormInspectionError(
            response.status === 401 || response.status === 403
                ? 'This form requires access and cannot be inspected.'
                : 'The form page could not be downloaded.',
            response.status === 401 || response.status === 403 ? 422 : 502,
        );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        throw new WebFormInspectionError('The link did not return an HTML form page.', 422);
    }

    let html: string;
    try {
        html = (await readBodyLimited(response, MAX_HTML_BYTES)).toString('utf8');
    } catch (error) {
        if (error instanceof PublicHttpError) {
            throw new WebFormInspectionError(error.message, publicHttpStatus(error));
        }
        throw error;
    }

    const text = extractVisibleText(html);
    if (!text) {
        throw new WebFormInspectionError('No readable form content was found on this page.', 422);
    }

    return {
        provider: 'web_form',
        form_url: url.toString(),
        title: extractTitle(html),
        text,
    };
}
