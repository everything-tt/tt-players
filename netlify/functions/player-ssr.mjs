import template from './player-template.mjs';
import {
  buildQueryStateScript,
  createServerApiFetcher,
  renderPlayerRequest,
} from '../../apps/mobile/dist-ssr/render-player.js';

function injectTemplate(headHtml, appHtml, dehydratedState) {
  for (const marker of ['<!--app-head-->', '<!--app-html-->', '<!--ssr-state-->']) {
    if (!template.includes(marker)) {
      throw new Error(`Built index.html is missing SSR marker: ${marker}`);
    }
  }

  const stateScript = dehydratedState
    ? buildQueryStateScript(dehydratedState)
    : '';

  return template
    .replace('<title>TT Players</title>', '')
    .replace('<!--app-head-->', headHtml)
    .replace('<!--app-html-->', appHtml)
    .replace('<!--ssr-state-->', stateScript);
}

function getSiteOrigin(request) {
  const requestUrl = new URL(request.url);
  const forwardedHost = request.headers.get('x-forwarded-host')
    ?? request.headers.get('host');
  const forwardedProto = request.headers.get('x-forwarded-proto')
    ?.split(',')[0]
    ?.trim();

  if (!forwardedHost) return requestUrl.origin;
  return `${forwardedProto || requestUrl.protocol.replace(':', '')}://${forwardedHost}`;
}

export default async (request) => {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { allow: 'GET' },
    });
  }

  const functionUrl = new URL(request.url);
  const playerId = functionUrl.searchParams.get('playerId')?.trim();
  if (!playerId) {
    return new Response('Player id is required', { status: 400 });
  }

  const apiOrigin = process.env.SSR_API_ORIGIN?.trim();
  if (!apiOrigin) {
    return new Response('Player profile SSR is not configured', {
      status: 500,
      headers: {
        'content-type': 'text/plain; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  }

  const siteOrigin = getSiteOrigin(request);
  const publicUrl = new URL(`/players/${encodeURIComponent(playerId)}`, siteOrigin);
  const result = await renderPlayerRequest({
    playerId,
    requestUrl: publicUrl.toString(),
    siteOrigin,
    apiFetcher: createServerApiFetcher(apiOrigin),
  });

  return new Response(
    injectTemplate(result.headHtml, result.appHtml, result.dehydratedState),
    {
      status: result.status,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': result.status === 200
          ? 'public, max-age=0, must-revalidate'
          : 'no-store',
      },
    },
  );
};
