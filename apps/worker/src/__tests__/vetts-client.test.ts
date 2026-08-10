import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchVettsHtml } from '../vetts-client.js';

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('VETTS HTTP client', () => {
    it('sends the consent cookie to both VETTS hosts', async () => {
        const requests: Array<Record<string, string>> = [];
        vi.stubGlobal('fetch', vi.fn(async (_input: string, init?: RequestInit) => {
            requests.push(init?.headers as Record<string, string>);
            return new Response('<html><body>ok</body></html>', { status: 200 });
        }));

        await fetchVettsHtml('https://www.vetts.org.uk/tournaments.aspx?year=2026');
        await fetchVettsHtml('https://vetts.tournamentsoftware.com/tournament/example');

        expect(requests.map((headers) => headers.Cookie)).toEqual([
            'st=cp=33&c=1',
            'st=cp=33&c=1',
        ]);
    });

    it('rejects a successful HTTP response that is still a cookie wall', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => ({
            ok: true,
            status: 200,
            statusText: 'OK',
            url: 'https://vetts.tournamentsoftware.com/cookiewall/?returnurl=%2Ftournament%2Fexample',
            text: async () => '<html><h1>How do I clear cookies?</h1></html>',
        } as Response)));

        await expect(
            fetchVettsHtml('https://vetts.tournamentsoftware.com/tournament/example'),
        ).rejects.toThrow('VETTS cookie wall blocked');
    });
});
