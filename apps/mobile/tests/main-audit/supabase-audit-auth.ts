import type { Page } from '@playwright/test';

const DEFAULT_CHUNK_SIZE = 3000;
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 60;

export interface SupabaseTokenResponse {
  access_token?: string;
  refresh_token?: string;
  token_type?: string;
  expires_in?: number;
  expires_at?: number;
  user?: unknown;
  [key: string]: unknown;
}

export interface SyntheticSessionOptions {
  supabaseUrl: string;
  publishableKey: string;
  email: string;
  password: string;
  fetchImpl?: typeof fetch;
  nowSeconds?: number;
}

export type SyntheticUserOptions = SyntheticSessionOptions;

export interface StoredSessionChunk {
  name: string;
  value: string;
}

export function buildSupabaseStorageKey(supabaseUrl: string): string {
  let parsed: URL;
  try {
    parsed = new URL(supabaseUrl);
  } catch {
    throw new Error('A valid Supabase project URL is required');
  }

  const match = parsed.hostname.match(/^([a-z0-9-]+)\.supabase\.co$/i);
  if (!match?.[1]) {
    throw new Error('A Supabase project URL is required');
  }

  return `sb-${match[1]}-auth-token`;
}

export function chunkStoredSession(
  storageKey: string,
  serializedSession: string,
  chunkSize = DEFAULT_CHUNK_SIZE,
): StoredSessionChunk[] {
  if (!Number.isInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('Chunk size must be a positive integer');
  }

  if (serializedSession.length <= chunkSize) {
    return [{ name: storageKey, value: serializedSession }];
  }

  const chunks: StoredSessionChunk[] = [];
  for (let offset = 0, index = 0; offset < serializedSession.length; offset += chunkSize, index += 1) {
    chunks.push({
      name: `${storageKey}.${index}`,
      value: serializedSession.slice(offset, offset + chunkSize),
    });
  }
  return chunks;
}

function requireOption(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} is required for authenticated UI audit`);
  return trimmed;
}

export async function requestSyntheticSession(
  options: SyntheticSessionOptions,
): Promise<SupabaseTokenResponse> {
  const supabaseUrl = requireOption(options.supabaseUrl, 'Supabase URL').replace(/\/$/, '');
  const publishableKey = requireOption(options.publishableKey, 'Supabase publishable key');
  const email = requireOption(options.email, 'UI audit email');
  const password = requireOption(options.password, 'UI audit password');
  const fetchImpl = options.fetchImpl ?? fetch;

  const response = await fetchImpl(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      apikey: publishableKey,
      Authorization: `Bearer ${publishableKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new Error(`Synthetic Supabase login failed with status ${response.status}`);
  }

  const token = await response.json() as SupabaseTokenResponse;
  if (!token.access_token || !token.refresh_token || !token.user) {
    throw new Error('Synthetic Supabase login returned an incomplete session');
  }

  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  return {
    ...token,
    expires_at: token.expires_at
      ?? (typeof token.expires_in === 'number' ? nowSeconds + token.expires_in : undefined),
  };
}

export async function signInSyntheticUser(page: Page, options: SyntheticUserOptions): Promise<void> {
  const supabaseUrl = requireOption(options.supabaseUrl, 'Supabase URL').replace(/\/$/, '');
  const nowSeconds = options.nowSeconds ?? Math.floor(Date.now() / 1000);
  const session = await requestSyntheticSession({ ...options, supabaseUrl, nowSeconds });
  const storageKey = buildSupabaseStorageKey(supabaseUrl);
  const chunks = chunkStoredSession(storageKey, JSON.stringify(session));
  const applicationUrl = new URL(page.url());
  const expires = nowSeconds + SESSION_MAX_AGE_SECONDS;

  await page.context().addCookies(chunks.map((chunk) => ({
    name: chunk.name,
    value: encodeURIComponent(chunk.value),
    url: applicationUrl.origin,
    secure: applicationUrl.protocol === 'https:',
    sameSite: 'Lax' as const,
    expires,
  })));
}
