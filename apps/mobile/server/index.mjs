import { createServer as createHttpServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const serverDir = path.dirname(fileURLToPath(import.meta.url));
const mobileRoot = path.resolve(serverDir, '..');
const clientDir = path.resolve(mobileRoot, 'dist');
const serverBundle = path.resolve(mobileRoot, 'dist-ssr/entry-server.js');
const indexPath = path.resolve(clientDir, 'index.html');
const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? process.env.VITE_PORT ?? 7474);

let vite;
let productionTemplate;
let productionRenderer;

if (production) {
  productionTemplate = await readFile(indexPath, 'utf8');
  ({ renderPlayerHtml: productionRenderer } = await import(pathToFileURL(serverBundle).href));
} else {
  const { createServer } = await import('vite');
  vite = await createServer({
    root: mobileRoot,
    appType: 'custom',
    server: {
      middlewareMode: true,
    },
  });
}

function getRequestOrigin(request) {
  const forwardedProto = request.headers['x-forwarded-proto'];
  const protocol = typeof forwardedProto === 'string'
    ? forwardedProto.split(',')[0].trim()
    : 'http';
  const host = request.headers.host ?? `localhost:${port}`;
  return `${protocol}://${host}`;
}

function isHtmlRequest(request) {
  const accept = request.headers.accept ?? '';
  return request.method === 'GET' && (accept.includes('text/html') || accept === '*/*' || accept === '');
}

function isCanonicalPlayerPath(url) {
  const pathname = new URL(url, 'http://localhost').pathname;
  return /^\/players\/[^/]+$/.test(pathname);
}

async function getDevTemplate(url) {
  const rawTemplate = await readFile(path.resolve(mobileRoot, 'index.html'), 'utf8');
  return vite.transformIndexHtml(url, rawTemplate);
}

async function renderPlayerRequest(request, response) {
  const origin = getRequestOrigin(request);
  const url = request.url ?? '/';
  const template = production ? productionTemplate : await getDevTemplate(url);
  const renderer = production
    ? productionRenderer
    : (await vite.ssrLoadModule('/src/entry-server.tsx')).renderPlayerHtml;
  const result = await renderer({
    url,
    requestOrigin: origin,
    template,
    apiOrigin: process.env.SSR_API_ORIGIN,
  });

  if (!result) return false;
  response.writeHead(result.status, {
    'content-type': 'text/html; charset=utf-8',
    'cache-control': result.status === 200 ? 'public, max-age=0, must-revalidate' : 'no-store',
  });
  response.end(result.html);
  return true;
}

async function readRequestBody(request) {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  return Buffer.concat(chunks);
}

async function proxyApiRequest(request, response) {
  const apiOrigin = process.env.SSR_API_ORIGIN?.trim();
  if (!apiOrigin || !request.url?.startsWith('/api/')) return false;

  const target = new URL(request.url, `${apiOrigin.replace(/\/+$/, '')}/`);
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (name.toLowerCase() === 'host' || value === undefined) continue;
    if (Array.isArray(value)) {
      for (const item of value) headers.append(name, item);
    } else {
      headers.set(name, value);
    }
  }

  const upstream = await fetch(target, {
    method: request.method,
    headers,
    body: await readRequestBody(request),
    redirect: 'manual',
  });
  const responseHeaders = {};
  upstream.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });
  response.writeHead(upstream.status, responseHeaders);
  response.end(Buffer.from(await upstream.arrayBuffer()));
  return true;
}

const contentTypes = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.webmanifest', 'application/manifest+json'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
]);

async function serveProductionAsset(request, response) {
  const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
  const relativePath = pathname.replace(/^\/+/, '');
  if (!relativePath) return false;

  const filePath = path.resolve(clientDir, relativePath);
  const clientPrefix = `${clientDir}${path.sep}`;
  if (filePath !== clientDir && !filePath.startsWith(clientPrefix)) return false;

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) return false;
    const extension = path.extname(filePath).toLowerCase();
    const cacheControl = pathname.startsWith('/assets/')
      ? 'public, max-age=31536000, immutable'
      : pathname === '/sw.js'
        ? 'no-cache, no-store, must-revalidate'
        : 'public, max-age=0, must-revalidate';
    response.writeHead(200, {
      'content-type': contentTypes.get(extension) ?? 'application/octet-stream',
      'cache-control': cacheControl,
    });
    response.end(await readFile(filePath));
    return true;
  } catch {
    return false;
  }
}

const server = createHttpServer(async (request, response) => {
  try {
    const url = request.url ?? '/';

    if (request.method === 'GET' && isCanonicalPlayerPath(url)) {
      if (await renderPlayerRequest(request, response)) return;
    }

    if (production) {
      if (await proxyApiRequest(request, response)) return;
      if (await serveProductionAsset(request, response)) return;
      if (isHtmlRequest(request)) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(productionTemplate);
        return;
      }
      response.writeHead(404).end('Not found');
      return;
    }

    vite.middlewares(request, response, async (error) => {
      if (error) {
        vite.ssrFixStacktrace(error);
        response.writeHead(500).end(error.stack ?? error.message);
        return;
      }
      if (isHtmlRequest(request)) {
        response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
        response.end(await getDevTemplate(url));
        return;
      }
      response.writeHead(404).end('Not found');
    });
  } catch (error) {
    if (!production && vite && error instanceof Error) {
      vite.ssrFixStacktrace(error);
    }
    response.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    response.end(error instanceof Error ? error.stack ?? error.message : 'Internal server error');
  }
});

server.listen(port, () => {
  console.log(`TT Players SSR server listening on http://localhost:${port}`);
});
