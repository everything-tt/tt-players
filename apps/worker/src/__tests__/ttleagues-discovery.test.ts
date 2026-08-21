import { describe, expect, it, vi } from 'vitest';
import { discoverTTLeaguesTenant } from '../ttleagues-discovery.js';

function jsonResponse(value: unknown, status = 200): Response {
    return new Response(JSON.stringify(value), {
        status,
        headers: { 'content-type': 'application/json' },
    });
}

describe('TT Leagues tenant discovery', () => {
    it('discovers competitions and divisions with tenant headers', async () => {
        const requests: Array<{ url: string; headers: Headers }> = [];
        const fetchImpl = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
            const url = String(input);
            requests.push({ url, headers: new Headers(init?.headers) });
            if (url.endsWith('/competitions')) {
                return jsonResponse([{ id: 4718, name: 'Chester & EP 2026-27 Season' }]);
            }
            if (url.endsWith('/competitions/4718/divisions')) {
                return jsonResponse([
                    { id: 12001, name: 'Division 1' },
                    { id: 12002, name: 'Division 2' },
                ]);
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        const result = await discoverTTLeaguesTenant(
            'https://chesterandellesmereport.ttleagues.com',
            { fetchImpl },
        );

        expect(result.status).toBe('healthy');
        expect(result.tenantHost).toBe('chesterandellesmereport.ttleagues.com');
        expect(result.competitions).toEqual([
            {
                id: 4718,
                name: 'Chester & EP 2026-27 Season',
                divisions: [
                    { id: 12001, name: 'Division 1' },
                    { id: 12002, name: 'Division 2' },
                ],
            },
        ]);
        expect(requests).toHaveLength(2);
        for (const request of requests) {
            expect(request.headers.get('Tenant')).toBe('chesterandellesmereport.ttleagues.com');
            expect(request.headers.get('Entry')).toBe('1');
        }
    });

    it('records a successfully parsed empty catalogue without probing divisions', async () => {
        const fetchImpl = vi.fn(async () => jsonResponse([]));

        const result = await discoverTTLeaguesTenant(
            'https://evesham.ttleagues.com',
            { fetchImpl },
        );

        expect(result).toEqual({
            tenantHost: 'evesham.ttleagues.com',
            status: 'no_active_competition',
            competitions: [],
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it('fails discovery on provider errors or malformed catalogues', async () => {
        const failedFetch = vi.fn(async () => jsonResponse({ message: 'blocked' }, 403));
        await expect(discoverTTLeaguesTenant(
            'https://blocked.ttleagues.com',
            { fetchImpl: failedFetch },
        )).rejects.toThrow('HTTP 403');

        const malformedFetch = vi.fn(async () => jsonResponse({ id: 1 }));
        await expect(discoverTTLeaguesTenant(
            'https://malformed.ttleagues.com',
            { fetchImpl: malformedFetch },
        )).rejects.toThrow('competition catalogue response must be an array');
    });
});
