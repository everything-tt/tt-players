import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import { z } from 'zod';
import {
    normalizeTournamentName,
    scoreTournamentMatch,
    type TournamentMatchDecision,
    type TournamentMatchInput,
} from './tournament-normalization.js';
import {
    chooseTournamentCandidate,
    type ReconciliationCandidate,
} from './tournament-reconciliation.js';

const DEFAULT_CLOUDFLARE_API_BASE_URL = 'https://api.cloudflare.com/client/v4';
const DEFAULT_CLOUDFLARE_EMBEDDING_MODEL = '@cf/baai/bge-small-en-v1.5';
const DEFAULT_CLOUDFLARE_EMBEDDING_DIMENSIONS = 384;
const DEFAULT_CLOUDFLARE_EMBEDDING_TIMEOUT_MS = 10_000;
const EMBEDDING_PROVIDER = 'cloudflare-workers-ai';
const AUTOMATIC_THRESHOLD = 0.92;
const REVIEW_THRESHOLD = 0.75;
const AMBIGUITY_MARGIN = 0.05;

const CloudflareEmbeddingResponseSchema = z.object({
    success: z.literal(true),
    result: z.object({
        shape: z.array(z.number().int().nonnegative()).optional(),
        data: z.union([
            z.array(z.array(z.number())).min(1),
            z.array(z.number()).min(1),
        ]),
    }),
});

type EmbeddingFetchResponse = {
    ok: boolean;
    status: number;
    statusText: string;
    json(): Promise<unknown>;
    text(): Promise<string>;
};

type EmbeddingFetch = (
    url: string,
    init: {
        method: 'POST';
        headers: Record<string, string>;
        body: string;
        signal: AbortSignal;
    },
) => Promise<EmbeddingFetchResponse>;

export interface TournamentEmbeddingInput {
    name: string;
    category?: string | null;
}

export interface CloudflareEmbeddingOptions {
    apiToken?: string;
    accountId?: string;
    apiBaseUrl?: string;
    model?: string;
    dimensions?: number;
    timeoutMs?: number;
    fetchImpl?: EmbeddingFetch;
}

interface ResolvedCloudflareEmbeddingOptions {
    apiToken: string;
    accountId: string;
    apiBaseUrl: string;
    model: string;
    dimensions: number;
    timeoutMs: number;
    fetchImpl: EmbeddingFetch;
}

export interface TournamentEmbeddingMatchScore {
    name: number;
    semantic: number | null;
    date: number;
    venue: number;
    category: number;
    total: number;
    decision: TournamentMatchDecision;
}

export interface TournamentEmbeddingCandidateChoice {
    decision: TournamentMatchDecision;
    candidate: ReconciliationCandidate | null;
    score: TournamentEmbeddingMatchScore | null;
    reason: 'matched' | 'review-threshold' | 'ambiguous' | 'below-threshold';
    embeddingUsed: boolean;
    embeddingModel: string | null;
    embeddingDimensions: number | null;
    embeddingError?: string;
}

function positiveInteger(value: string | undefined, fallback: number): number {
    if (!value) return fallback;
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function roundScore(value: number): number {
    return Math.round(value * 10_000) / 10_000;
}

function hasText(value?: string | null): boolean {
    return Boolean(value?.trim());
}

function hasDateRange(value: TournamentMatchInput): boolean {
    return Boolean(value.startDate || value.endDate);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

export function hasCloudflareEmbeddingCredentials(): boolean {
    return Boolean(
        process.env['CLOUDFLARE_API_TOKEN']
        && process.env['CLOUDFLARE_ACCOUNT_ID'],
    );
}

export function buildTournamentEmbeddingText(event: TournamentEmbeddingInput): string {
    const name = normalizeTournamentName(event.name);
    const category = normalizeTournamentName(event.category ?? '');

    return [
        `table tennis tournament: ${name}`,
        category ? `category: ${category}` : null,
    ]
        .filter((value): value is string => Boolean(value))
        .join('\n');
}

export function tournamentEmbeddingInputHash(
    inputText: string,
    model: string,
    dimensions: number,
): string {
    return createHash('sha256')
        .update(`${EMBEDDING_PROVIDER}\n${model}\n${dimensions}\n${inputText}`)
        .digest('hex');
}

function resolveOptions(
    options: CloudflareEmbeddingOptions = {},
): ResolvedCloudflareEmbeddingOptions {
    const apiToken = options.apiToken ?? process.env['CLOUDFLARE_API_TOKEN'];
    if (!apiToken) {
        throw new Error(
            'CLOUDFLARE_API_TOKEN is required for tournament embedding matching',
        );
    }

    const accountId = options.accountId ?? process.env['CLOUDFLARE_ACCOUNT_ID'];
    if (!accountId) {
        throw new Error(
            'CLOUDFLARE_ACCOUNT_ID is required for tournament embedding matching',
        );
    }

    const apiBaseUrl = (
        options.apiBaseUrl
        ?? process.env['CLOUDFLARE_API_BASE_URL']
        ?? DEFAULT_CLOUDFLARE_API_BASE_URL
    ).replace(/\/+$/, '');
    const model = options.model
        ?? process.env['CLOUDFLARE_EMBEDDING_MODEL']
        ?? DEFAULT_CLOUDFLARE_EMBEDDING_MODEL;
    const dimensions = options.dimensions
        ?? positiveInteger(
            process.env['CLOUDFLARE_EMBEDDING_DIMENSIONS'],
            DEFAULT_CLOUDFLARE_EMBEDDING_DIMENSIONS,
        );
    const timeoutMs = options.timeoutMs
        ?? positiveInteger(
            process.env['CLOUDFLARE_EMBEDDING_TIMEOUT_MS'],
            DEFAULT_CLOUDFLARE_EMBEDDING_TIMEOUT_MS,
        );
    const fetchImpl = options.fetchImpl
        ?? (globalThis.fetch as unknown as EmbeddingFetch);

    if (!fetchImpl) {
        throw new Error(
            'Global fetch is unavailable for the Cloudflare embeddings request',
        );
    }

    return {
        apiToken,
        accountId,
        apiBaseUrl,
        model,
        dimensions,
        timeoutMs,
        fetchImpl,
    };
}

function embeddingsEndpoint(options: ResolvedCloudflareEmbeddingOptions): string {
    return `${options.apiBaseUrl}/accounts/${encodeURIComponent(options.accountId)}/ai/run/${options.model}`;
}

function isRetryableStatus(status: number): boolean {
    return status === 408 || status === 409 || status === 429 || status >= 500;
}

function isRetryableError(error: unknown): boolean {
    return error instanceof Error
        && (error.name === 'AbortError' || error.name === 'TypeError');
}

function delay(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function requestCloudflareEmbeddings(
    inputTexts: string[],
    options: ResolvedCloudflareEmbeddingOptions,
): Promise<number[][]> {
    if (inputTexts.length === 0) return [];

    for (let attempt = 0; attempt < 2; attempt += 1) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), options.timeoutMs);

        try {
            const response = await options.fetchImpl(embeddingsEndpoint(options), {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${options.apiToken}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: inputTexts,
                }),
                signal: controller.signal,
            });

            if (!response.ok) {
                const responseText = (await response.text()).slice(0, 500);
                if (attempt === 0 && isRetryableStatus(response.status)) {
                    await delay(250);
                    continue;
                }
                throw new Error(
                    `Cloudflare embeddings request failed (${response.status} ${response.statusText}): ${responseText}`,
                );
            }

            const parsed = CloudflareEmbeddingResponseSchema.parse(
                    await response.json(),
                );
                const rawData = parsed.result.data;
                const vectors = Array.isArray(rawData[0])
                    ? rawData as number[][]
                    : [rawData as number[]];
                if (vectors.length !== inputTexts.length) {
                    throw new Error(
                        `Cloudflare embeddings response returned ${vectors.length} vectors for ${inputTexts.length} inputs`,
                    );
                }

                return vectors.map((embedding) => {
                    if (embedding.length !== options.dimensions) {
                        throw new Error(
                            `Cloudflare embedding has ${embedding.length} dimensions; expected ${options.dimensions}`,
                        );
                    }
                    return embedding;
                });
        } catch (error) {
            if (attempt === 0 && isRetryableError(error)) {
                await delay(250);
                continue;
            }
            throw error;
        } finally {
            clearTimeout(timeout);
        }
    }

    throw new Error('Cloudflare embeddings request failed after retry');
}

export async function createCloudflareEmbeddings(
    events: TournamentEmbeddingInput[],
    options: CloudflareEmbeddingOptions = {},
): Promise<number[][]> {
    const resolved = resolveOptions(options);
    return requestCloudflareEmbeddings(
        events.map(buildTournamentEmbeddingText),
        resolved,
    );
}

export async function createCloudflareEmbedding(
    event: TournamentEmbeddingInput,
    options: CloudflareEmbeddingOptions = {},
): Promise<number[]> {
    const embeddings = await createCloudflareEmbeddings([event], options);
    return embeddings[0]!;
}

function storedEmbedding(value: unknown, dimensions: number): number[] | null {
    let parsed = value;
    if (typeof parsed === 'string') {
        try {
            parsed = JSON.parse(parsed);
        } catch {
            return null;
        }
    }
    if (!Array.isArray(parsed) || parsed.length !== dimensions) return null;
    if (
        !parsed.every(
            (item) => typeof item === 'number' && Number.isFinite(item),
        )
    ) {
        return null;
    }
    return parsed as number[];
}

export function cosineSimilarity(left: number[], right: number[]): number {
    if (left.length === 0 || left.length !== right.length) {
        throw new Error('Embeddings must have equal non-zero dimensions');
    }

    let dotProduct = 0;
    let leftMagnitude = 0;
    let rightMagnitude = 0;
    for (let index = 0; index < left.length; index += 1) {
        const leftValue = left[index]!;
        const rightValue = right[index]!;
        dotProduct += leftValue * rightValue;
        leftMagnitude += leftValue * leftValue;
        rightMagnitude += rightValue * rightValue;
    }

    const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
    if (denominator === 0) return 0;
    return roundScore(
        Math.max(-1, Math.min(1, dotProduct / denominator)),
    );
}

function hybridScore(
    incoming: TournamentMatchInput,
    candidate: ReconciliationCandidate,
    semantic: number,
): TournamentEmbeddingMatchScore {
    const structured = scoreTournamentMatch(incoming, candidate);
    const combinedName = semantic * 0.8 + structured.name * 0.2;

    let weightedScore = combinedName * 0.65;
    let availableWeight = 0.65;

    if (hasDateRange(incoming) && hasDateRange(candidate)) {
        weightedScore += structured.date * 0.25;
        availableWeight += 0.25;
    }
    if (hasText(incoming.category) && hasText(candidate.category)) {
        weightedScore += structured.category * 0.07;
        availableWeight += 0.07;
    }
    if (hasText(incoming.venue) && hasText(candidate.venue)) {
        weightedScore += structured.venue * 0.03;
        availableWeight += 0.03;
    }

    const total = roundScore(weightedScore / availableWeight);
    const automatic = total >= AUTOMATIC_THRESHOLD
        && semantic >= 0.82
        && structured.date >= 0.8;
    const review = total >= REVIEW_THRESHOLD
        && semantic >= 0.65
        && structured.date > 0;
    const decision: TournamentMatchDecision = automatic
        ? 'automatic'
        : review
            ? 'review'
            : 'none';

    return {
        name: structured.name,
        semantic: roundScore(semantic),
        date: structured.date,
        venue: structured.venue,
        category: structured.category,
        total,
        decision,
    };
}

export function chooseTournamentCandidateWithSemanticScores(
    incoming: TournamentMatchInput,
    candidates: ReconciliationCandidate[],
    semanticScores: ReadonlyMap<string, number>,
): TournamentEmbeddingCandidateChoice {
    const ranked = candidates
        .flatMap((candidate) => {
            const semantic = semanticScores.get(candidate.id);
            if (semantic === undefined) return [];
            return [{
                candidate,
                score: hybridScore(incoming, candidate, semantic),
            }];
        })
        .sort((left, right) => right.score.total - left.score.total);

    const best = ranked[0];
    if (!best || best.score.decision === 'none') {
        return {
            decision: 'none',
            candidate: null,
            score: null,
            reason: 'below-threshold',
            embeddingUsed: true,
            embeddingModel: null,
            embeddingDimensions: null,
        };
    }

    const second = ranked[1];
    const ambiguous = Boolean(
        second
        && second.score.total >= REVIEW_THRESHOLD
        && best.score.total - second.score.total < AMBIGUITY_MARGIN,
    );
    if (ambiguous) {
        return {
            decision: 'review',
            candidate: best.candidate,
            score: { ...best.score, decision: 'review' },
            reason: 'ambiguous',
            embeddingUsed: true,
            embeddingModel: null,
            embeddingDimensions: null,
        };
    }

    return {
        decision: best.score.decision,
        candidate: best.candidate,
        score: best.score,
        reason: best.score.decision === 'automatic'
            ? 'matched'
            : 'review-threshold',
        embeddingUsed: true,
        embeddingModel: null,
        embeddingDimensions: null,
    };
}

function fallbackChoice(
    incoming: TournamentMatchInput,
    candidates: ReconciliationCandidate[],
    embeddingError?: string,
): TournamentEmbeddingCandidateChoice {
    const fallback = chooseTournamentCandidate(incoming, candidates);
    return {
        ...fallback,
        score: fallback.score
            ? {
                ...fallback.score,
                semantic: null,
            }
            : null,
        embeddingUsed: false,
        embeddingModel: null,
        embeddingDimensions: null,
        ...(embeddingError ? { embeddingError } : {}),
    };
}

export async function chooseTournamentCandidateWithEmbeddings(
    database: Kysely<any>,
    incoming: TournamentMatchInput,
    candidates: ReconciliationCandidate[],
    options: CloudflareEmbeddingOptions = {},
): Promise<TournamentEmbeddingCandidateChoice> {
    if (candidates.length === 0) {
        return fallbackChoice(incoming, candidates);
    }

    const tokenAvailable = Boolean(
        options.apiToken ?? process.env['CLOUDFLARE_API_TOKEN'],
    );
    const accountAvailable = Boolean(
        options.accountId ?? process.env['CLOUDFLARE_ACCOUNT_ID'],
    );
    if (!tokenAvailable || !accountAvailable) {
        return fallbackChoice(
            incoming,
            candidates,
            'Cloudflare embedding credentials are not configured; used deterministic tournament matching',
        );
    }

    try {
        const resolved = resolveOptions(options);
        const candidateIds = candidates.map((candidate) => candidate.id);
        const cachedRows = await database
            .selectFrom('staging.competition_embeddings')
            .select([
                'competition_id',
                'provider',
                'model',
                'dimensions',
                'input_hash',
                'embedding',
            ])
            .where('competition_id', 'in', candidateIds)
            .execute();
        const cachedByCompetition = new Map(
            cachedRows.map((row: Record<string, unknown>) => [
                String(row.competition_id),
                row,
            ]),
        );

        const candidateVectors = new Map<string, number[]>();
        const missingCandidates: Array<{
            candidate: ReconciliationCandidate;
            inputText: string;
            inputHash: string;
        }> = [];

        for (const candidate of candidates) {
            const inputText = buildTournamentEmbeddingText(candidate);
            const inputHash = tournamentEmbeddingInputHash(
                inputText,
                resolved.model,
                resolved.dimensions,
            );
            const cached = cachedByCompetition.get(candidate.id) as
                Record<string, unknown> | undefined;
            const cachedVector = cached
                && cached.provider === EMBEDDING_PROVIDER
                && cached.model === resolved.model
                && Number(cached.dimensions) === resolved.dimensions
                && cached.input_hash === inputHash
                ? storedEmbedding(cached.embedding, resolved.dimensions)
                : null;

            if (cachedVector) {
                candidateVectors.set(candidate.id, cachedVector);
            } else {
                missingCandidates.push({
                    candidate,
                    inputText,
                    inputHash,
                });
            }
        }

        const incomingText = buildTournamentEmbeddingText(incoming);
        const generated = await requestCloudflareEmbeddings(
            [
                incomingText,
                ...missingCandidates.map((item) => item.inputText),
            ],
            resolved,
        );
        const incomingVector = generated[0]!;
        const now = new Date();

        for (let index = 0; index < missingCandidates.length; index += 1) {
            const item = missingCandidates[index]!;
            const vector = generated[index + 1]!;
            candidateVectors.set(item.candidate.id, vector);
            await database
                .insertInto('staging.competition_embeddings')
                .values({
                    competition_id: item.candidate.id,
                    provider: EMBEDDING_PROVIDER,
                    model: resolved.model,
                    dimensions: resolved.dimensions,
                    input_text: item.inputText,
                    input_hash: item.inputHash,
                    embedding: vector,
                    created_at: now,
                    updated_at: now,
                })
                .onConflict((conflict) =>
                    conflict.column('competition_id').doUpdateSet({
                        provider: EMBEDDING_PROVIDER,
                        model: resolved.model,
                        dimensions: resolved.dimensions,
                        input_text: item.inputText,
                        input_hash: item.inputHash,
                        embedding: vector,
                        updated_at: now,
                    }),
                )
                .execute();
        }

        const semanticScores = new Map<string, number>();
        for (const candidate of candidates) {
            const vector = candidateVectors.get(candidate.id);
            if (vector) {
                semanticScores.set(
                    candidate.id,
                    cosineSimilarity(incomingVector, vector),
                );
            }
        }

        const choice = chooseTournamentCandidateWithSemanticScores(
            incoming,
            candidates,
            semanticScores,
        );
        return {
            ...choice,
            embeddingModel: resolved.model,
            embeddingDimensions: resolved.dimensions,
        };
    } catch (error) {
        return fallbackChoice(
            incoming,
            candidates,
            `Embedding matching failed: ${errorMessage(error)}`,
        );
    }
}
