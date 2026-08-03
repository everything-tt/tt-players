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

async function prepareAppState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    if (sessionStorage.getItem('tt_test_keep_my_player') !== 'true') {
      localStorage.removeItem('tt_players_my_player');
    }
  });
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

test('keeps the player profile hero compact, padded and behaviourally complete', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);

  const lookupParams = new URLSearchParams({ q: 'Wudong Liu', limit: '10', offset: '0' });
  const lookupResponse = await page.request.get(`${previewUrl}/api/players/search?${lookupParams.toString()}`);
  expect(lookupResponse.ok()).toBe(true);
  const lookup = await lookupResponse.json() as PlayerSearchResponse;
  const player = lookup.data.find((item) => item.name === 'Wudong Liu') ?? lookup.data[0];
  expect(player).toBeTruthy();

  await page.goto(`${previewUrl}/tabs/players/player/${player!.id}`, { waitUntil: 'domcontentloaded' });

  const hero = page.locator('.tt-player-profile-hero');
  await expect(hero).toBeVisible({ timeout: 30_000 });
  await expect(hero.getByText('Player profile', { exact: true })).toBeVisible();
  await expect(hero.getByText('Rating', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(hero.getByRole('button', { name: 'Save to favourites' })).toBeVisible();
  await expect(hero.getByText('History', { exact: true })).toBeVisible();
  await expect(hero.locator('.tt-player-profile-form-indicator')).toBeVisible();
  await expect(hero.locator('.tt-form-recent')).toHaveCount(0);

  const geometry = await hero.evaluate((element) => {
    const shell = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    const selectors = [
      '.tt-player-profile-eyebrow',
      '.tt-player-profile-identity',
      '.tt-player-profile-actions',
      '.tt-player-profile-form-heading',
      '.tt-player-profile-form-grid',
      '.tt-player-profile-form-indicator',
    ];
    return {
      shell: { left: shell.left, right: shell.right, width: shell.width, height: shell.height },
      padding: {
        left: Number.parseFloat(style.paddingLeft),
        right: Number.parseFloat(style.paddingRight),
      },
      children: selectors.map((selector) => {
        const child = element.querySelector<HTMLElement>(selector);
        const rect = child?.getBoundingClientRect();
        return {
          selector,
          leftInset: rect ? rect.left - shell.left : null,
          rightInset: rect ? shell.right - rect.right : null,
        };
      }),
    };
  });

  expect(geometry.padding.left).toBeGreaterThanOrEqual(12);
  expect(geometry.padding.right).toBeGreaterThanOrEqual(12);
  for (const child of geometry.children) {
    expect(child.leftInset, `${child.selector} left inset`).not.toBeNull();
    expect(child.leftInset!, `${child.selector} left inset`).toBeGreaterThanOrEqual(12);
    expect(child.rightInset!, `${child.selector} right inset`).toBeGreaterThanOrEqual(12);
  }

  const actions = hero.locator('.tt-player-profile-actions > *');
  await expect(actions).toHaveCount(4);
  const actionBoxes = await actions.evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, height: rect.height };
  }));
  expect(Math.max(...actionBoxes.map((box) => box.top)) - Math.min(...actionBoxes.map((box) => box.top))).toBeLessThan(4);
  expect(Math.max(...actionBoxes.map((box) => box.height))).toBeLessThanOrEqual(48);
  expect(geometry.shell.height).toBeLessThan(700);

  await capture(page, testInfo, 'player-profile-hero', geometry);

  await page.evaluate(({ id, name }) => {
    localStorage.setItem('tt_players_my_player', JSON.stringify({ id, name }));
    sessionStorage.setItem('tt_test_keep_my_player', 'true');
  }, player!);
  await page.reload({ waitUntil: 'domcontentloaded' });

  const currentUserHero = page.locator('.tt-player-profile-hero');
  await expect(currentUserHero.getByText('Claimed as your profile', { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(currentUserHero.locator('.tt-player-profile-actions > *')).toHaveCount(3);
  await expect(currentUserHero.getByRole('button', { name: 'Save to favourites' })).toHaveCount(0);

  writeReportIndex(previewUrl);
});
