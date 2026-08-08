import { describe, expect, it, vi } from 'vitest';
import { createServerApiFetcher, resolveServerApiBase } from './server-api';

describe('server API fetcher', () => {
  it('builds the API base directly from the configured server origin', () => {
    expect(resolveServerApiBase('https://backend.example.test/')).toBe(
      'https://backend.example.test/api',
    );
  });

  it('rejects missing or relative server origins instead of self-proxying', () => {
    expect(() => resolveServerApiBase('')).toThrow('absolute http(s) origin');
    expect(() => resolveServerApiBase('/api')).toThrow('absolute http(s) origin');
  });

  it('fetches the backend directly without a Netlify /api round-trip', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    })) as unknown as typeof fetch;
    const fetcher = createServerApiFetcher('https://backend.example.test', fetchImpl);

    await expect(fetcher<{ ok: boolean }>('/players/p-1/profile-overview')).resolves.toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://backend.example.test/api/players/p-1/profile-overview',
      { signal: undefined },
    );
  });
});
