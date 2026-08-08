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

export function resolveServerApiBase(
  apiBase: string,
  requestOrigin: string,
  configuredOrigin?: string,
): string {
  if (/^https?:\/\//i.test(apiBase)) {
    return trimTrailingSlashes(apiBase);
  }

  const origin = configuredOrigin?.trim() || requestOrigin;
  const normalizedOrigin = `${trimTrailingSlashes(origin)}/`;
  return trimTrailingSlashes(new URL(apiBase, normalizedOrigin).toString());
}

export function createServerApiFetcher(
  apiBase: string,
  requestOrigin: string,
  configuredOrigin?: string,
  fetchImpl: typeof fetch = fetch,
): ApiFetcher {
  const resolvedBase = resolveServerApiBase(apiBase, requestOrigin, configuredOrigin);

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
