const GOOGLE_DOCS_HOST = 'docs.google.com';
const GOOGLE_SHORT_HOST = 'forms.gle';
const MAX_FORM_HTML_BYTES = 2_000_000;
const MAX_PUBLIC_TEXT_CHARS = 40_000;
const FETCH_TIMEOUT_MS = 10_000;
const MAX_REDIRECTS = 4;
const MAX_FIELDS = 200;

export type GoogleFormFieldKind =
    | 'short_text'
    | 'paragraph'
    | 'multiple_choice'
    | 'dropdown'
    | 'checkboxes'
    | 'linear_scale'
    | 'grid'
    | 'date'
    | 'time'
    | 'unknown';

export interface GoogleFormField {
    id: string;
    label: string;
    description: string | null;
    kind: GoogleFormFieldKind;
    required: boolean;
    options: string[];
    prefill_parameter?: 'emailAddress';
}

export interface GoogleFormInspection {
    provider: 'google_forms';
    form_url: string;
    title: string;
    public_text: string | null;
    fields: GoogleFormField[];
}

type GoogleFormInspectionStatusCode = 400 | 422 | 502;
type GoogleFormQuestionTuple = [number | string, string, unknown, number, unknown[]];

export class GoogleFormInspectionError extends Error {
    readonly statusCode: GoogleFormInspectionStatusCode;

    constructor(message: string, statusCode: GoogleFormInspectionStatusCode) {
        super(message);
        this.name = 'GoogleFormInspectionError';
        this.statusCode = statusCode;
    }
}

type FetchLike = typeof fetch;

function isAllowedGoogleFormHost(hostname: string): boolean {
    return hostname === GOOGLE_DOCS_HOST || hostname === GOOGLE_SHORT_HOST;
}

function isGoogleFormPath(url: URL): boolean {
    if (url.hostname === GOOGLE_SHORT_HOST) return url.pathname.length > 1;
    if (url.hostname !== GOOGLE_DOCS_HOST) return false;
    return /^\/forms\/d\/(?:e\/)?[^/]+(?:\/viewform)?\/?$/.test(url.pathname);
}

export function normalizeGoogleFormUrl(input: string): URL {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        throw new GoogleFormInspectionError('Enter a valid Google Forms URL.', 400);
    }

    if (url.protocol !== 'https:' || !isAllowedGoogleFormHost(url.hostname) || !isGoogleFormPath(url)) {
        throw new GoogleFormInspectionError('Only public Google Forms links are supported.', 400);
    }

    url.username = '';
    url.password = '';
    url.search = '';
    url.hash = '';
    return url;
}

export function isGoogleFormUrl(input: string | null | undefined): boolean {
    if (!input) return false;
    try {
        normalizeGoogleFormUrl(input);
        return true;
    } catch {
        return false;
    }
}

function canonicalViewUrl(url: URL): URL {
    const canonical = new URL(url.toString());
    canonical.search = '';
    canonical.hash = '';
    if (canonical.hostname === GOOGLE_DOCS_HOST && !canonical.pathname.endsWith('/viewform')) {
        canonical.pathname = `${canonical.pathname.replace(/\/$/, '')}/viewform`;
    }
    return canonical;
}

function redirectLocation(response: Response, currentUrl: URL): URL | null {
    if (response.status < 300 || response.status >= 400) return null;
    const location = response.headers.get('location');
    if (!location) {
        throw new GoogleFormInspectionError('The Google Forms redirect was incomplete.', 502);
    }
    return new URL(location, currentUrl);
}

async function readLimitedHtml(response: Response): Promise<string> {
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_FORM_HTML_BYTES) {
        throw new GoogleFormInspectionError('This form is too large to inspect.', 422);
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (contentType && !contentType.toLowerCase().includes('text/html')) {
        throw new GoogleFormInspectionError('The link did not return a Google Form page.', 422);
    }

    const html = await response.text();
    if (Buffer.byteLength(html, 'utf8') > MAX_FORM_HTML_BYTES) {
        throw new GoogleFormInspectionError('This form is too large to inspect.', 422);
    }
    return html;
}

function extractBalancedArray(source: string, startIndex: number): string | null {
    let depth = 0;
    let quote: '"' | "'" | null = null;
    let escaped = false;

    for (let index = startIndex; index < source.length; index += 1) {
        const character = source[index];
        if (quote) {
            if (escaped) {
                escaped = false;
            } else if (character === '\\') {
                escaped = true;
            } else if (character === quote) {
                quote = null;
            }
            continue;
        }

        if (character === '"' || character === "'") {
            quote = character;
            continue;
        }
        if (character === '[') depth += 1;
        if (character === ']') {
            depth -= 1;
            if (depth === 0) return source.slice(startIndex, index + 1);
        }
    }
    return null;
}

export function extractGoogleFormLoadData(html: string): unknown[] {
    const markerIndex = html.indexOf('FB_PUBLIC_LOAD_DATA_');
    if (markerIndex < 0) {
        throw new GoogleFormInspectionError('This Google Form is not publicly inspectable.', 422);
    }

    const assignmentIndex = html.indexOf('=', markerIndex);
    const arrayStart = assignmentIndex < 0 ? -1 : html.indexOf('[', assignmentIndex);
    if (arrayStart < 0) {
        throw new GoogleFormInspectionError('The Google Form structure could not be read.', 422);
    }

    const payload = extractBalancedArray(html, arrayStart);
    if (!payload) {
        throw new GoogleFormInspectionError('The Google Form structure was incomplete.', 422);
    }

    try {
        const parsed = JSON.parse(payload) as unknown;
        if (!Array.isArray(parsed)) throw new Error('Not an array');
        return parsed;
    } catch {
        throw new GoogleFormInspectionError('The Google Form structure could not be decoded.', 422);
    }
}

function fieldKind(type: number): GoogleFormFieldKind {
    switch (type) {
        case 0: return 'short_text';
        case 1: return 'paragraph';
        case 2: return 'multiple_choice';
        case 3: return 'dropdown';
        case 4: return 'checkboxes';
        case 5: return 'linear_scale';
        case 7: return 'grid';
        case 9: return 'date';
        case 10: return 'time';
        default: return 'unknown';
    }
}

function isQuestionTuple(value: unknown): value is GoogleFormQuestionTuple {
    return Array.isArray(value)
        && (typeof value[0] === 'number' || typeof value[0] === 'string')
        && typeof value[1] === 'string'
        && typeof value[3] === 'number'
        && Array.isArray(value[4])
        && value[4].some((entry) => Array.isArray(entry) && typeof entry[0] === 'number');
}

function collectChoiceStrings(value: unknown, output: Set<string>, depth = 0): void {
    if (depth > 4 || output.size >= 100 || !Array.isArray(value)) return;
    for (const item of value) {
        if (Array.isArray(item)) {
            if (typeof item[0] === 'string' && item[0].trim()) {
                output.add(item[0].trim());
            } else {
                collectChoiceStrings(item, output, depth + 1);
            }
        }
    }
}

function entryOptions(entry: unknown[], kind: GoogleFormFieldKind): string[] {
    if (kind !== 'multiple_choice' && kind !== 'dropdown' && kind !== 'checkboxes') return [];
    const values = new Set<string>();
    collectChoiceStrings(entry[1], values);
    collectChoiceStrings(entry[4], values);
    return Array.from(values);
}

function collectResponseEmailField(html: string, output: Map<string, GoogleFormField>): void {
    const responderEmailInput = /\bname\s*=\s*(["'])emailAddress\1/i.test(html);
    if (!responderEmailInput) return;

    output.set('emailAddress', {
        id: 'emailAddress',
        label: 'Email',
        description: 'Email address used by Google Forms for this response',
        kind: 'short_text',
        required: true,
        options: [],
        prefill_parameter: 'emailAddress',
    });
}

function collectFields(value: unknown, output: Map<string, GoogleFormField>): void {
    if (!Array.isArray(value) || output.size >= MAX_FIELDS) return;

    if (isQuestionTuple(value)) {
        const label = value[1].trim();
        const description = typeof value[2] === 'string' && value[2].trim()
            ? value[2].trim()
            : null;
        const kind = fieldKind(value[3]);
        const entries = value[4];

        for (const rawEntry of entries) {
            if (!Array.isArray(rawEntry) || typeof rawEntry[0] !== 'number') continue;
            const id = String(rawEntry[0]);
            if (output.has(id)) continue;
            output.set(id, {
                id,
                label: label || `Question ${id}`,
                description,
                kind,
                required: rawEntry[2] === 1 || rawEntry[2] === true,
                options: entryOptions(rawEntry, kind),
            });
            if (output.size >= MAX_FIELDS) break;
        }
        return;
    }

    for (const child of value) collectFields(child, output);
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

function formTitle(html: string): string {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = match ? decodeHtmlText(match[1].replace(/<[^>]+>/g, ' ')) : '';
    return title.replace(/\s*-\s*Google Forms\s*$/i, '').trim() || 'Google Form';
}

function formPublicText(html: string): string | null {
    const bodyMatch = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
    if (!bodyMatch) return null;

    const text = decodeHtmlText(bodyMatch[1]
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<\/(?:p|div|section|article|header|footer|h[1-6]|li)>/gi, '\n')
        .replace(/<[^>]+>/g, ' '))
        .replace(/\s+/g, ' ')
        .trim();

    return text ? text.slice(0, MAX_PUBLIC_TEXT_CHARS) : null;
}

export function parseGoogleFormHtml(html: string, formUrl: string): GoogleFormInspection {
    const loadData = extractGoogleFormLoadData(html);
    const fields = new Map<string, GoogleFormField>();
    collectResponseEmailField(html, fields);
    collectFields(loadData, fields);

    if (fields.size === 0) {
        throw new GoogleFormInspectionError('No supported questions were found in this form.', 422);
    }

    return {
        provider: 'google_forms',
        form_url: canonicalViewUrl(normalizeGoogleFormUrl(formUrl)).toString(),
        title: formTitle(html),
        public_text: formPublicText(html),
        fields: Array.from(fields.values()),
    };
}

export async function inspectGoogleForm(
    input: string,
    fetcher: FetchLike = fetch,
): Promise<GoogleFormInspection> {
    let currentUrl = normalizeGoogleFormUrl(input);

    for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
        const response = await fetcher(currentUrl, {
            method: 'GET',
            redirect: 'manual',
            headers: {
                Accept: 'text/html,application/xhtml+xml',
                'User-Agent': 'TT-Players-Form-Inspector/1.0',
            },
            signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        });

        const nextUrl = redirectLocation(response, currentUrl);
        if (nextUrl) {
            if (redirectCount === MAX_REDIRECTS) {
                throw new GoogleFormInspectionError('The Google Forms link redirected too many times.', 502);
            }
            if (nextUrl.protocol !== 'https:' || !isAllowedGoogleFormHost(nextUrl.hostname) || !isGoogleFormPath(nextUrl)) {
                throw new GoogleFormInspectionError('The link redirected outside Google Forms.', 400);
            }
            currentUrl = normalizeGoogleFormUrl(nextUrl.toString());
            continue;
        }

        if (!response.ok) {
            throw new GoogleFormInspectionError(
                response.status === 401 || response.status === 403
                    ? 'This Google Form requires access and cannot be inspected.'
                    : 'Google Forms could not be reached.',
                response.status === 401 || response.status === 403 ? 422 : 502,
            );
        }

        const html = await readLimitedHtml(response);
        return parseGoogleFormHtml(html, currentUrl.toString());
    }

    throw new GoogleFormInspectionError('The Google Forms link could not be resolved.', 502);
}
