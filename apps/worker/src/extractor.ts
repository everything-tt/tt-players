import { createHash } from 'node:crypto';
import { type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';
import { fetchWithTT365Policy } from './tt365-http.js';
import { fetchWithTTLeaguesPolicy, isTTLeaguesUrl } from './ttleagues-http.js';

export interface RawEvidenceContext {
    sourceResourceId?: string | null;
    requestFingerprint?: string;
    adapterVersion?: string | null;
    httpStatus?: number | null;
}

const VOLATILE_REQUEST_HEADERS = new Set([
    'authorization',
    'proxy-authorization',
    'cookie',
    'set-cookie',
    'x-csrf-token',
    'x-xsrf-token',
    'x-request-verification-token',
]);

function stableRequestBody(body: BodyInit | null | undefined): string {
    if (body == null) return '';
    if (typeof body === 'string') return body;
    if (body instanceof URLSearchParams) return body.toString();

    throw new Error(
        'Cannot derive a stable request fingerprint for this request body type; '
        + 'provide context.requestFingerprint explicitly.',
    );
}

/**
 * Build a stable fingerprint for the logical HTTP request without persisting
 * header values themselves. Header names are normalized and sorted so caller
 * ordering/casing cannot change identity. Credential/session headers are
 * deliberately excluded because rotating tokens must not create new logical
 * source identities. Semantic headers such as TT Leagues' Tenant header remain
 * part of the identity.
 *
 * Deterministic string/URLSearchParams request bodies are represented by a
 * SHA-256 body hash. Callers using streaming, multipart or otherwise unstable
 * request bodies must supply an explicit requestFingerprint.
 *
 * MD5 is used only as a compact deterministic identity fingerprint, not for
 * security or content integrity. Raw content and request bodies use SHA-256.
 */
export function createRequestFingerprint(
    url: string,
    requestInit: RequestInit = {},
): string {
    const headers = new Headers(requestInit.headers);
    const canonicalHeaders = Array.from(headers.entries())
        .filter(([name]) => !VOLATILE_REQUEST_HEADERS.has(name.toLowerCase()))
        .map(([name, value]) => `${name.toLowerCase()}:${value.trim()}`)
        .sort()
        .join('\n');
    const method = (requestInit.method ?? 'GET').toUpperCase();
    const requestBody = stableRequestBody(requestInit.body);
    const bodyIdentity = requestBody.length > 0
        ? `\nbody-sha256:${createHash('sha256').update(requestBody).digest('hex')}`
        : '';
    const canonicalRequest = `${method}\n${url}\n${canonicalHeaders}${bodyIdentity}`;

    return createHash('md5').update(canonicalRequest).digest('hex');
}

export async function storeScrapePayload(
    url: string,
    platformId: string,
    body: string,
    db: Kysely<Database>,
    context: RawEvidenceContext = {},
): Promise<string> {
    const hash = createHash('sha256').update(body).digest('hex');
    const now = new Date();
    const requestFingerprint = context.requestFingerprint
        ?? createRequestFingerprint(url);
    const sourceScope = context.sourceResourceId
        ? `resource:${context.sourceResourceId}`
        : `platform:${platformId}`;

    const result = await db
        .insertInto('staging.raw_scrape_logs')
        .values({
            platform_id: platformId,
            endpoint_url: url,
            raw_payload: body,
            payload_hash: hash,
            source_resource_id: context.sourceResourceId ?? null,
            source_scope: sourceScope,
            request_fingerprint: requestFingerprint,
            adapter_version: context.adapterVersion ?? null,
            http_status: context.httpStatus ?? null,
            status: 'pending',
            scraped_at: now,
            updated_at: now,
        })
        .onConflict((oc) =>
            oc.columns(['source_scope', 'request_fingerprint', 'payload_hash']).doUpdateSet({
                scraped_at: now,
                updated_at: now,
                http_status: context.httpStatus ?? null,
                adapter_version: context.adapterVersion ?? null,
            }),
        )
        .returning('id')
        .executeTakeFirstOrThrow();

    return result.id;
}

/**
 * Fetches data from the given URL, hashes the response body (SHA256),
 * and upserts it into the `raw_scrape_logs` table.
 *
 * Evidence identity is source/request-aware:
 * - the source scope is either a source_resource or the platform fallback;
 * - method + URL + stable request headers/body form the request fingerprint;
 * - the response body hash is the content identity.
 *
 * This prevents tenant/header-sensitive requests from collapsing into the same
 * evidence row while preserving deduplication across credential rotation.
 */
export async function extractAndStore(
    url: string,
    platformId: string,
    db: Kysely<Database>,
    requestInit: RequestInit = {},
    context: Omit<RawEvidenceContext, 'httpStatus'> = {},
): Promise<string> {
    // Resolve request identity before I/O so unsupported body types fail without
    // making a request. Callers can provide a stable override when necessary.
    const requestFingerprint = context.requestFingerprint
        ?? createRequestFingerprint(url, requestInit);

    const response = isTTLeaguesUrl(url)
        ? await fetchWithTTLeaguesPolicy(url, requestInit)
        : await fetchWithTT365Policy(url, requestInit);

    if (!response.ok) {
        throw new Error(
            `HTTP ${response.status} ${response.statusText} when fetching ${url}`,
        );
    }

    const body = await response.text();
    return storeScrapePayload(url, platformId, body, db, {
        ...context,
        requestFingerprint,
        httpStatus: response.status,
    });
}
