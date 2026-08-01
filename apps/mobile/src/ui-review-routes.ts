export interface BuildReviewRouteListOptions {
  baseUrl: string;
  discoveredUrls?: string[];
  maxRoutes?: number;
}

const DEFAULT_REVIEW_PATHS = [
  '/',
  '/tabs/home',
  '/tabs/players',
  '/tabs/leagues',
  '/tabs/events',
  '/tabs/h2h',
  '/about',
  '/data-coverage',
];

const IGNORED_PATH_PREFIXES = [
  '/api/',
  '/assets/',
  '/appkit/',
  '/images/',
];

const IGNORED_EXTENSIONS = /\.(?:avif|css|gif|ico|jpeg|jpg|js|json|map|png|svg|txt|webmanifest|woff2?)$/i;

function normalizeBaseUrl(baseUrl: string): URL {
  const url = new URL(baseUrl);
  url.hash = '';
  url.search = '';
  if (!url.pathname.endsWith('/')) {
    url.pathname = `${url.pathname}/`;
  }
  return url;
}

function normalizeRouteUrl(candidate: string, baseUrl: string): string | null {
  let url: URL;
  const base = normalizeBaseUrl(baseUrl);

  try {
    url = new URL(candidate, base);
  } catch {
    return null;
  }

  if (url.origin !== base.origin) return null;
  if (!['http:', 'https:'].includes(url.protocol)) return null;
  if (IGNORED_PATH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix))) return null;
  if (IGNORED_EXTENSIONS.test(url.pathname)) return null;

  url.hash = '';
  url.search = '';
  return url.toString();
}

export function isReviewableUrl(candidate: string, baseUrl: string): boolean {
  return normalizeRouteUrl(candidate, baseUrl) !== null;
}

export function createScreenshotSlug(url: string): string {
  const parsed = new URL(url);
  const slug = parsed.pathname
    .replace(/^\/+|\/+$/g, '')
    .replace(/[^A-Za-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
  return slug || 'home';
}

export function buildReviewRouteList({
  baseUrl,
  discoveredUrls = [],
  maxRoutes = 12,
}: BuildReviewRouteListOptions): string[] {
  const base = normalizeBaseUrl(baseUrl);
  const routes = new Map<string, string>();

  for (const path of [...DEFAULT_REVIEW_PATHS, ...discoveredUrls]) {
    const normalized = normalizeRouteUrl(path, base.toString());
    if (!normalized) continue;
    const key = new URL(normalized).pathname;
    if (!routes.has(key)) {
      routes.set(key, normalized);
    }
    if (routes.size >= maxRoutes) break;
  }

  return [...routes.values()];
}
