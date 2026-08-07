import { describe, expect, it } from 'vitest';
import {
    assertPublicHttpsUrl,
    PublicHttpError,
    readBodyLimited,
} from '../public-http.js';

describe('public HTTP guardrails', () => {
    it('rejects loopback and link-local IP literals', async () => {
        await expect(assertPublicHttpsUrl(new URL('https://127.0.0.1/internal')))
            .rejects.toMatchObject<Partial<PublicHttpError>>({ code: 'blocked_address' });
        await expect(assertPublicHttpsUrl(new URL('https://169.254.169.254/latest/meta-data')))
            .rejects.toMatchObject<Partial<PublicHttpError>>({ code: 'blocked_address' });
        await expect(assertPublicHttpsUrl(new URL('https://[::1]/internal')))
            .rejects.toMatchObject<Partial<PublicHttpError>>({ code: 'blocked_address' });
    });

    it('allows a public IP literal without DNS resolution', async () => {
        await expect(assertPublicHttpsUrl(new URL('https://1.1.1.1/form'))).resolves.toBeUndefined();
    });

    it('stops streaming once the body exceeds the byte cap', async () => {
        const response = new Response(new Uint8Array([1, 2, 3, 4, 5]));
        await expect(readBodyLimited(response, 4))
            .rejects.toMatchObject<Partial<PublicHttpError>>({ code: 'response_too_large' });
    });

    it('returns a bounded body when it fits', async () => {
        const response = new Response('entry form');
        await expect(readBodyLimited(response, 100)).resolves.toEqual(Buffer.from('entry form'));
    });
});
