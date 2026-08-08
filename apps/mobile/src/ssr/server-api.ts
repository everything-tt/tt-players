import type { ApiFetcher } from '../player-profile-query';

export class ServerApiError extends Error {
  readonly status: number;

  constructor(status: number, url: string) {
    super(`HTTP ${status} from ${url}`);
    this.name = 'ServerApiError';
    this.status = status;
  }
}

function trimTrailingSlashes(value: string): string {
  return value.replace(/\/+$/, '');
}

export function resolveServerApiBase(apiOrigin: string, apiPath = '/api'): string {
  const configuredOrigin = apiOrigin.trim();
  if (!/^https?:\/\//i.test(configuredOrigin)) {
    throw new Error('SSR_API_ORIGIN must be an absolute http(s) origin');
  }

  const origin = `${trimTrailingSlashes(configuredOrigin)}/`;
  const normalizedPath = apiPath.replace(/^\/+/, '');
  return trimTrailingSlashes(new URL(normalizedPath, origin).toString());
}

export function createServerApiFetcher(
  apiOrigin: string,
  fetchImpl: typeof fetch = fetch,
): ApiFetcher {
  const resolvedBase = resolveServerApiBase(apiOrigin);

  return async function serverApiFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
    const normalizedPath = path.startsWith('/') ? path : `/${path}`;
    const url = `${resolvedBase}${normalizedPath}`;
    const response = await fetchImpl(url, { signal });
    if (!response.ok) {
      throw new ServerApiError(response.status, url);
    }
    return response.json() as Promise<T>;
  };
}
