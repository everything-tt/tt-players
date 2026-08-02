import { describe, expect, it } from 'vitest';
import {
  buildSupabaseStorageKey,
  chunkStoredSession,
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
