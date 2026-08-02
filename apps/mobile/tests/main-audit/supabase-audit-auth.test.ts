import { describe, expect, it, vi } from 'vitest';
import {
  buildSupabaseStorageKey,
  chunkStoredSession,
  requestSyntheticSession,
} from './supabase-audit-auth';

describe('buildSupabaseStorageKey', () => {
  it('derives the default supabase-js auth key from the project URL', () => {
    expect(buildSupabaseStorageKey('https://abcdefghijklmnop.supabase.co'))
      .toBe('sb-abcdefghijklmnop-auth-token');
  });

  it('rejects a URL that is not a Supabase project host', () => {
    expect(() => buildSupabaseStorageKey('https://example.com'))
      .toThrow(/supabase project url/i);
  });
});

describe('chunkStoredSession', () => {
  it('keeps a short session in one cookie', () => {
    expect(chunkStoredSession('sb-project-auth-token', 'session', 10)).toEqual([
      { name: 'sb-project-auth-token', value: 'session' },
    ]);
  });

  it('uses the same numbered cookie chunks as crossDomainAuthStorage', () => {
    expect(chunkStoredSession('sb-project-auth-token', 'abcdefgh', 3)).toEqual([
      { name: 'sb-project-auth-token.0', value: 'abc' },
      { name: 'sb-project-auth-token.1', value: 'def' },
      { name: 'sb-project-auth-token.2', value: 'gh' },
    ]);
  });

  it('rejects an invalid chunk size', () => {
    expect(() => chunkStoredSession('sb-project-auth-token', 'session', 0))
      .toThrow(/chunk size/i);
  });
});

describe('requestSyntheticSession', () => {
  it('exchanges credentials through an injected server-side fetch implementation', async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_in: 3600,
      user: { id: 'audit-user' },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));

    const session = await requestSyntheticSession({
      supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
      publishableKey: 'public-key',
      email: 'ui-audit@example.com',
      password: 'not-logged',
      fetchImpl,
      nowSeconds: 1000,
    });

    expect(fetchImpl).toHaveBeenCalledOnce();
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://abcdefghijklmnop.supabase.co/auth/v1/token?grant_type=password',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          apikey: 'public-key',
          Authorization: 'Bearer public-key',
        }),
        body: JSON.stringify({ email: 'ui-audit@example.com', password: 'not-logged' }),
      }),
    );
    expect(session).toMatchObject({
      access_token: 'access-token',
      refresh_token: 'refresh-token',
      expires_at: 4600,
      user: { id: 'audit-user' },
    });
  });

  it('reports only the HTTP status when authentication fails', async () => {
    const fetchImpl = vi.fn(async () => new Response('contains-sensitive-provider-message', { status: 401 }));

    await expect(requestSyntheticSession({
      supabaseUrl: 'https://abcdefghijklmnop.supabase.co',
      publishableKey: 'public-key',
      email: 'ui-audit@example.com',
      password: 'not-logged',
      fetchImpl,
    })).rejects.toThrow('Synthetic Supabase login failed with status 401');
  });
});
