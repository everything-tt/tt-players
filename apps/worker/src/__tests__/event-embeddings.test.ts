import { describe, expect, it, vi } from 'vitest';
import {
    buildTournamentEmbeddingText,
    chooseTournamentCandidateWithSemanticScores,
    cosineSimilarity,
    createCloudflareEmbeddings,
} from '../event-embeddings.js';
import type { ReconciliationCandidate } from '../tournament-reconciliation.js';

const candidate = (
    id: string,
    overrides: Partial<ReconciliationCandidate> = {},
): ReconciliationCandidate => ({
    id,
    name: 'Liverpool Centenary Senior 4 Star Open',
    startDate: '2026-08-22',
    endDate: '2026-08-23',
    venue: 'Wavertree Tennis Centre Liverpool L15 4LE',
    category: 'Senior 4 Star',
    ...overrides,
});

describe('event embeddings', () => {
    it('builds stable normalized text without result-page noise', () => {
        expect(buildTournamentEmbeddingText({
            name: 'Liverpool Centenary Senior 4* Open Results',
            category: 'Senior 4*',
        })).toBe([
            'table tennis tournament: liverpool centenary senior 4 star open',
            'category: senior 4 star',
        ].join('\n'));
    });

    it('calls the Cloudflare Workers AI model endpoint in a batch', async () => {
        const fetchImpl = vi.fn(async (url: string, init: {
            headers: Record<string, string>;
            body: string;
        }) => {
            expect(url).toBe(
                'https://api.cloudflare.test/client/v4/accounts/account-123/ai/run/@cf/baai/bge-small-en-v1.5',
            );
            expect(init.headers.Authorization).toBe('Bearer test-token');

            const body = JSON.parse(init.body) as Record<string, unknown>;
            expect(body).toEqual({
                text: [
                    'table tennis tournament: first open',
                    'table tennis tournament: second open',
                ],
            });

            return {
                ok: true,
                status: 200,
                statusText: 'OK',
                json: async () => ({
                    success: true,
                    result: {
                        shape: [2, 2],
                        data: [
                            [1, 0],
                            [0, 1],
                        ],
                        pooling: 'mean',
                    },
                    errors: [],
                    messages: [],
                }),
                text: async () => '',
            };
        });

        const embeddings = await createCloudflareEmbeddings(
            [{ name: 'First Open' }, { name: 'Second Open' }],
            {
                apiToken: 'test-token',
                accountId: 'account-123',
                apiBaseUrl: 'https://api.cloudflare.test/client/v4',
                model: '@cf/baai/bge-small-en-v1.5',
                dimensions: 2,
                fetchImpl,
            },
        );

        expect(fetchImpl).toHaveBeenCalledOnce();
        expect(embeddings).toEqual([[1, 0], [0, 1]]);
    });

    it('calculates cosine similarity', () => {
        expect(cosineSimilarity([1, 0], [1, 0])).toBe(1);
        expect(cosineSimilarity([1, 0], [0, 1])).toBe(0);
    });

    it('automatically matches a strong semantic result without an incoming venue', () => {
        const incoming = {
            name: 'Centenary Liverpool 4* Senior Open Results',
            startDate: '2026-08-22',
            endDate: '2026-08-22',
            venue: null,
            category: 'Senior 4 Star',
        };
        const choice = chooseTournamentCandidateWithSemanticScores(
            incoming,
            [
                candidate('matching'),
                candidate('other', {
                    name: 'Nottingham Junior 2 Star Open',
                    venue: 'Nottingham',
                    category: 'Junior 2 Star',
                }),
            ],
            new Map([
                ['matching', 0.97],
                ['other', 0.35],
            ]),
        );

        expect(choice.decision).toBe('automatic');
        expect(choice.candidate?.id).toBe('matching');
        expect(choice.score?.semantic).toBe(0.97);
        expect(choice.score?.total).toBeGreaterThanOrEqual(0.92);
    });

    it('requires review when two semantic candidates are nearly tied', () => {
        const incoming = {
            name: 'Liverpool Centenary Senior 4 Star Open',
            startDate: '2026-08-22',
            endDate: '2026-08-22',
            venue: null,
            category: 'Senior 4 Star',
        };
        const choice = chooseTournamentCandidateWithSemanticScores(
            incoming,
            [candidate('first'), candidate('second')],
            new Map([
                ['first', 0.96],
                ['second', 0.95],
            ]),
        );

        expect(choice.decision).toBe('review');
        expect(choice.reason).toBe('ambiguous');
    });

    it('does not automatically merge a semantically similar event on a weak date', () => {
        const incoming = {
            name: 'Liverpool Centenary Senior 4 Star Open',
            startDate: '2026-08-29',
            endDate: '2026-08-29',
            venue: null,
            category: 'Senior 4 Star',
        };
        const choice = chooseTournamentCandidateWithSemanticScores(
            incoming,
            [candidate('one-week-earlier')],
            new Map([['one-week-earlier', 0.99]]),
        );

        expect(choice.decision).not.toBe('automatic');
    });
});
