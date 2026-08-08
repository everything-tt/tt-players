import { QueryClientProvider, dehydrate } from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { Route, Routes } from 'react-router-dom';
import { StaticRouter } from 'react-router-dom/server';
import { PlayerSsrProfile } from './CanonicalPlayerPage';
import { playerProfileOverviewQueryOptions, type ApiFetcher } from './player-profile-query';
import { API_BASE_URL } from './player-shared';
import { createMobileQueryClient } from './query-client';
import { buildPlayerMeta, type PlayerMeta } from './seo/player-meta';
import { createServerApiFetcher, ServerApiError } from './ssr/server-api';
import { buildQueryStateScript } from './ssr/serialize';

export type PlayerSsrRenderOptions = {
  url: string;
  requestOrigin: string;
  template: string;
  apiOrigin?: string;
  apiBase?: string;
  fetcher?: ApiFetcher;
};

export type PlayerSsrResponse = {
  status: number;
  html: string;
};

function escapeHtmlText(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtmlText(value)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderPlayerHead(meta: PlayerMeta): string {
  const title = escapeHtmlText(meta.title);
  const description = escapeHtmlAttribute(meta.description);
  const canonicalUrl = escapeHtmlAttribute(meta.canonicalUrl);
  const imageUrl = escapeHtmlAttribute(meta.imageUrl);
  const escapedTitle = escapeHtmlAttribute(meta.title);

  return [
    `<title>${title}</title>`,
    `<meta name="description" content="${description}" />`,
    '<meta name="robots" content="index,follow" />',
    `<link rel="canonical" href="${canonicalUrl}" />`,
    '<meta property="og:type" content="profile" />',
    '<meta property="og:site_name" content="TT Players" />',
    `<meta property="og:title" content="${escapedTitle}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:image" content="${imageUrl}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${escapedTitle}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${imageUrl}" />`,
  ].join('\n    ');
}

function errorHead(title: string): string {
  return [
    `<title>${escapeHtmlText(title)}</title>`,
    '<meta name="robots" content="noindex,follow" />',
  ].join('\n    ');
}

function injectIntoTemplate(
  template: string,
  headHtml: string,
  appHtml: string,
  stateScript = '',
): string {
  if (!template.includes('<!--app-head-->')
    || !template.includes('<!--app-html-->')
    || !template.includes('<!--ssr-state-->')) {
    throw new Error('SSR template markers are missing from index.html');
  }

  return template
    .replace('<title>TT Players</title>', '')
    .replace('<!--app-head-->', headHtml)
    .replace('<!--app-html-->', appHtml)
    .replace('<!--ssr-state-->', stateScript);
}

function matchCanonicalPlayerId(url: string, requestOrigin: string): string | null {
  const pathname = new URL(url, requestOrigin).pathname;
  const match = pathname.match(/^\/players\/([^/]+)$/);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
}

function renderErrorPage(template: string, status: number, title: string, message: string): PlayerSsrResponse {
  const appHtml = [
    '<main class="tt-player-ssr-shell">',
    '<section class="tt-player-profile-hero">',
    `<h1>${escapeHtmlText(title)}</h1>`,
    `<p>${escapeHtmlText(message)}</p>`,
    '</section>',
    '</main>',
  ].join('');

  return {
    status,
    html: injectIntoTemplate(template, errorHead(`${title} | TT Players`), appHtml),
  };
}

export async function renderPlayerHtml(
  options: PlayerSsrRenderOptions,
): Promise<PlayerSsrResponse | null> {
  const playerId = matchCanonicalPlayerId(options.url, options.requestOrigin);
  if (!playerId) return null;

  const queryClient = createMobileQueryClient();
  const fetcher = options.fetcher ?? createServerApiFetcher(
    options.apiBase ?? API_BASE_URL,
    options.requestOrigin,
    options.apiOrigin,
  );

  try {
    const profile = await queryClient.fetchQuery(
      playerProfileOverviewQueryOptions(playerId, fetcher),
    );
    const meta = buildPlayerMeta(options.requestOrigin, profile);
    const appHtml = renderToString(
      <QueryClientProvider client={queryClient}>
        <StaticRouter location={new URL(options.url, options.requestOrigin).pathname}>
          <Routes>
            <Route path="/players/:playerId" element={<PlayerSsrProfile />} />
          </Routes>
        </StaticRouter>
      </QueryClientProvider>,
    );
    const dehydratedState = dehydrate(queryClient);

    return {
      status: 200,
      html: injectIntoTemplate(
        options.template,
        renderPlayerHead(meta),
        appHtml,
        buildQueryStateScript(dehydratedState),
      ),
    };
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) {
      return renderErrorPage(
        options.template,
        404,
        'Player not found',
        'No public player profile exists for this player.',
      );
    }

    const status = error instanceof ServerApiError && error.status >= 500
      ? error.status
      : 500;
    return renderErrorPage(
      options.template,
      status,
      'Player profile unavailable',
      'The player profile could not be loaded right now.',
    );
  } finally {
    queryClient.clear();
  }
}
