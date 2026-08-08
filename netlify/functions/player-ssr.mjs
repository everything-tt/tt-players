import { renderPlayerHtml } from '../../apps/mobile/dist-ssr/entry-server.js';

let templatePromise;

async function getTemplate(origin) {
  if (!templatePromise) {
    templatePromise = fetch(new URL('/index.html', origin)).then(async (response) => {
      if (!response.ok) {
        throw new Error(`Failed to load client index.html: HTTP ${response.status}`);
      }
      return response.text();
    });
  }
  return templatePromise;
}

export default async (request) => {
  if (request.method !== 'GET') {
    return new Response('Method not allowed', {
      status: 405,
      headers: { allow: 'GET' },
    });
  }

  const functionUrl = new URL(request.url);
  const playerId = functionUrl.searchParams.get('playerId');
  if (!playerId) {
    return new Response('Player id is required', { status: 400 });
  }

  const publicUrl = new URL(`/players/${encodeURIComponent(playerId)}`, functionUrl.origin);
  const template = await getTemplate(functionUrl.origin);
  const result = await renderPlayerHtml({
    url: publicUrl.toString(),
    requestOrigin: functionUrl.origin,
    template,
    apiOrigin: process.env.SSR_API_ORIGIN,
  });

  if (!result) {
    return new Response('Not found', { status: 404 });
  }

  return new Response(result.html, {
    status: result.status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': result.status === 200
        ? 'public, max-age=0, must-revalidate'
        : 'no-store',
    },
  });
};
