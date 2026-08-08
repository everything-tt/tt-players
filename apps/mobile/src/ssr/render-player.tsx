import { StrictMode } from 'react';
import {
  QueryClientProvider,
  dehydrate,
  type DehydratedState,
} from '@tanstack/react-query';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { AppRoutes } from '../AppRoutes';
import { TabNavigationProvider } from '../navigation/tab-navigation';
import {
  playerProfileOverviewQueryOptions,
  type ApiFetcher,
} from '../player-profile-query';
import { createMobileQueryClient } from '../query-client';
import { buildPlayerMeta, type PlayerMeta } from '../seo/player-meta';
import { RuntimeProvider } from './runtime-context';
import { ServerApiError } from './server-api';

export { createServerApiFetcher } from './server-api';
export { buildQueryStateScript } from './serialize';

export type RenderPlayerRequest = {
  playerId: string;
  requestUrl: string;
  siteOrigin: string;
  apiFetcher: ApiFetcher;
};

export type RenderPlayerResult = {
  status: number;
  appHtml: string;
  headHtml: string;
  dehydratedState: DehydratedState | null;
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
  const titleText = escapeHtmlText(meta.title);
  const titleAttribute = escapeHtmlAttribute(meta.title);
  const description = escapeHtmlAttribute(meta.description);
  const canonicalUrl = escapeHtmlAttribute(meta.canonicalUrl);
  const imageUrl = escapeHtmlAttribute(meta.imageUrl);

  return [
    `<title>${titleText}</title>`,
    `<meta name="description" content="${description}" />`,
    '<meta name="robots" content="index,follow" />',
    `<link rel="canonical" href="${canonicalUrl}" />`,
    '<meta property="og:type" content="profile" />',
    '<meta property="og:site_name" content="TT Players" />',
    `<meta property="og:title" content="${titleAttribute}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${canonicalUrl}" />`,
    `<meta property="og:image" content="${imageUrl}" />`,
    '<meta name="twitter:card" content="summary_large_image" />',
    `<meta name="twitter:title" content="${titleAttribute}" />`,
    `<meta name="twitter:description" content="${description}" />`,
    `<meta name="twitter:image" content="${imageUrl}" />`,
  ].join('\n    ');
}

function renderErrorResult(status: number, title: string, message: string): RenderPlayerResult {
  return {
    status,
    headHtml: [
      `<title>${escapeHtmlText(title)} | TT Players</title>`,
      '<meta name="robots" content="noindex,follow" />',
    ].join('\n    '),
    appHtml: [
      '<main class="tt-player-ssr-error">',
      `<h1>${escapeHtmlText(title)}</h1>`,
      `<p>${escapeHtmlText(message)}</p>`,
      '</main>',
    ].join(''),
    dehydratedState: null,
  };
}

export async function renderPlayerRequest(
  input: RenderPlayerRequest,
): Promise<RenderPlayerResult> {
  const queryClient = createMobileQueryClient();

  try {
    const profile = await queryClient.fetchQuery(
      playerProfileOverviewQueryOptions(input.playerId, input.apiFetcher),
    );
    const meta = buildPlayerMeta(input.siteOrigin, profile);
    const location = new URL(input.requestUrl, input.siteOrigin).pathname;
    const appHtml = renderToString(
      <StrictMode>
        <QueryClientProvider client={queryClient}>
          <StaticRouter location={location}>
            <RuntimeProvider siteOrigin={input.siteOrigin} isSsrHydration>
              <TabNavigationProvider>
                <AppRoutes />
              </TabNavigationProvider>
            </RuntimeProvider>
          </StaticRouter>
        </QueryClientProvider>
      </StrictMode>,
    );

    return {
      status: 200,
      appHtml,
      headHtml: renderPlayerHead(meta),
      dehydratedState: dehydrate(queryClient),
    };
  } catch (error) {
    if (error instanceof ServerApiError && error.status === 404) {
      return renderErrorResult(
        404,
        'Player not found',
        'No public player profile exists for this player.',
      );
    }

    const status = error instanceof ServerApiError && error.status >= 500
      ? error.status
      : 500;
    return renderErrorResult(
      status,
      'Player profile unavailable',
      'The player profile could not be loaded right now.',
    );
  } finally {
    queryClient.clear();
  }
}
