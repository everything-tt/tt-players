import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

interface ScreenshotEntry {
  project: string;
  title: string;
  url: string;
  path: string;
  diagnosticsPath: string;
}

interface PlayerSearchResponse {
  data: Array<{ id: string; name: string }>;
}

const reportDir = process.env.UI_REVIEW_REPORT_DIR ?? 'ui-review-report';
const screenshotsDir = join(reportDir, 'screenshots');
const diagnosticsDir = join(reportDir, 'diagnostics');
const manifestPath = join(reportDir, 'manifest.json');

function requirePreviewUrl(): string {
  const previewUrl = process.env.PREVIEW_URL;
  if (!previewUrl) throw new Error('PREVIEW_URL is required');
  return previewUrl.replace(/\/$/, '');
}

function readManifest(): ScreenshotEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed as ScreenshotEntry[] : [];
  } catch {
    return [];
  }
}

function appendManifest(entry: ScreenshotEntry) {
  const entries = readManifest().filter((item) => item.path !== entry.path);
  entries.push(entry);
  writeFileSync(manifestPath, `${JSON.stringify(entries, null, 2)}\n`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function writeReportIndex(previewUrl: string) {
  const entries = readManifest();
  const cards = entries.map((entry) => `
    <article>
      <h2>${escapeHtml(`${entry.project}: ${entry.title}`)}</h2>
      <a href="${escapeHtml(entry.path)}"><img src="${escapeHtml(entry.path)}" alt="${escapeHtml(entry.title)}" /></a>
      <p><a href="${escapeHtml(entry.url)}">Open page</a></p>
      <p><a href="${escapeHtml(entry.diagnosticsPath)}">Diagnostics</a></p>
    </article>
  `).join('');

  writeFileSync(join(reportDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT Players UI Review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1100px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:#fff;border:1px solid #d9dfda;border-radius:10px;padding:14px}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:8px;display:block}a{color:#0f6655}
</style></head><body><main><h1>TT Players UI Review</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><div class="grid">${cards}</div></main></body></html>\n`);
}

async function capture(page: Page, testInfo: TestInfo, title: string, diagnostics: unknown) {
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), finalUrl: page.url(), diagnostics }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('serves and hydrates canonical player SSR through Netlify, including with the PWA installed', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  const lookupParams = new URLSearchParams({ q: 'Wudong Liu', limit: '10', offset: '0' });
  const lookupResponse = await page.request.get(`${previewUrl}/api/players/search?${lookupParams.toString()}`);
  expect(lookupResponse.ok()).toBe(true);
  const lookup = await lookupResponse.json() as PlayerSearchResponse;
  const player = lookup.data.find((item) => item.name === 'Wudong Liu') ?? lookup.data[0];
  expect(player).toBeTruthy();

  const canonicalPath = `/players/${player!.id}`;
  const canonicalUrl = `${previewUrl}${canonicalPath}`;

  const rawResponse = await page.request.get(canonicalUrl);
  expect(rawResponse.status()).toBe(200);
  expect(rawResponse.headers()['content-type']).toContain('text/html');
  const rawHtml = await rawResponse.text();
  expect(rawHtml).toContain(player!.name);
  expect(rawHtml).toContain(`<link rel="canonical" href="${canonicalUrl}"`);
  expect(rawHtml).toContain('name="robots" content="index,follow"');
  expect(rawHtml).toContain('id="__TT_QUERY_STATE__" type="application/json"');
  expect(rawHtml).toContain('id="tt-player-title"');

  const hydrationErrors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error' && /hydrat|server html|did not match/i.test(message.text())) {
      hydrationErrors.push(message.text());
    }
  });

  // Install/control the PWA from the normal SPA first. Canonical player document
  // navigations must still go to the network/Netlify SSR Function afterwards.
  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  const serviceWorkerReady = await page.evaluate(async () => {
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<null>((resolve) => window.setTimeout(() => resolve(null), 15_000)),
    ]);
    return Boolean(registration);
  });
  expect(serviceWorkerReady).toBe(true);

  if (!await page.evaluate(() => Boolean(navigator.serviceWorker.controller))) {
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller), undefined, { timeout: 15_000 });
  }

  const navigationResponse = await page.goto(canonicalUrl, { waitUntil: 'domcontentloaded' });
  expect(navigationResponse).not.toBeNull();
  expect(navigationResponse!.status()).toBe(200);
  expect(navigationResponse!.fromServiceWorker()).toBe(false);
  const navigationHtml = await navigationResponse!.text();
  expect(navigationHtml).toContain('id="__TT_QUERY_STATE__" type="application/json"');

  const hero = page.locator('.tt-player-profile-hero');
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(hero.locator('#tt-player-title')).toHaveText(player!.name);
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', canonicalUrl);
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'index,follow');
  expect(hydrationErrors).toEqual([]);

  await capture(page, testInfo, 'player-ssr-netlify', {
    playerId: player!.id,
    playerName: player!.name,
    rawStatus: rawResponse.status(),
    navigationStatus: navigationResponse!.status(),
    serviceWorkerControlled: await page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    navigationFromServiceWorker: navigationResponse!.fromServiceWorker(),
    hydrationErrors,
  });
  writeReportIndex(previewUrl);
});
