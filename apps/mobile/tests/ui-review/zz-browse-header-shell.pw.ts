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

const reportDir = process.env.UI_REVIEW_REPORT_DIR ?? 'ui-review-report';
const screenshotsDir = join(reportDir, 'screenshots');
const diagnosticsDir = join(reportDir, 'diagnostics');
const manifestPath = join(reportDir, 'manifest.json');

function requirePreviewUrl(): string {
  const previewUrl = process.env.PREVIEW_URL;
  if (!previewUrl) throw new Error('PREVIEW_URL is required');
  return previewUrl.replace(/\/$/, '');
}

async function prepareAppState(page: Page, theme: 'light-mode' | 'dark-mode') {
  await page.addInitScript((value) => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('tt_players_favourite_tournaments', JSON.stringify([]));
    if (!localStorage.getItem('TTPlayers-Theme')) localStorage.setItem('TTPlayers-Theme', value);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }, theme);
}

function readManifest(): ScreenshotEntry[] {
  try {
    const value = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    return Array.isArray(value) ? value as ScreenshotEntry[] : [];
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
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function writeReportIndex(previewUrl: string) {
  const cards = readManifest().map((entry) => `
    <article>
      <h2>${escapeHtml(entry.title)}</h2>
      <a href="${escapeHtml(entry.path)}"><img src="${escapeHtml(entry.path)}" alt="${escapeHtml(entry.title)}" /></a>
      <p><a href="${escapeHtml(entry.url)}">${escapeHtml(new URL(entry.url).pathname)}</a></p>
      <p><a href="${escapeHtml(entry.diagnosticsPath)}">Diagnostics</a></p>
    </article>`).join('');
  writeFileSync(join(reportDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT browse header review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f4f7f4;color:#17211d}main{max-width:1100px;margin:auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}article{background:white;border:1px solid #d9dfda;border-radius:10px;padding:12px}img{display:block;width:100%;height:auto;border:1px solid #d9dfda;border-radius:8px}a{color:#0f6655}
</style></head><body><main><h1>TT browse header review</h1><p><a href="${escapeHtml(previewUrl)}">Preview</a></p><div class="grid">${cards}</div></main></body></html>\n`);
}

async function settleForScreenshot(page: Page) {
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(150);
}

async function capture(page: Page, testInfo: TestInfo, title: string) {
  await settleForScreenshot(page);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  const diagnostics = await page.evaluate(() => ({
    route: location.pathname,
    viewport: { width: innerWidth, height: innerHeight },
    scrollY,
    scrollWidth: document.documentElement.scrollWidth,
    browseHeaderState: document.querySelector('.tt-browse-header')?.getAttribute('data-state'),
  }));
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify(diagnostics, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

async function assertNoHorizontalOverflow(page: Page, context: string) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `${context} must not overflow horizontally`).toBeLessThanOrEqual(1);
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('browse pages integrate the title and reveal a compact toolbar on scroll', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page, 'light-mode');
  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });

  const browseHeader = page.locator('.tt-browse-header');
  const expandedHeader = page.locator('.tt-browse-header__expanded');
  const compactHeader = page.locator('.tt-browse-header__compact');

  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);
  await expect(browseHeader).toHaveAttribute('data-state', 'expanded');
  await expect(expandedHeader).toHaveAttribute('aria-hidden', 'false');
  await expect(compactHeader).toHaveAttribute('aria-hidden', 'true');

  const expandedSurface = await expandedHeader.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      backgroundColor: style.backgroundColor,
      borderBottomWidth: style.borderBottomWidth,
      boxShadow: style.boxShadow,
    };
  });
  expect(expandedSurface.backgroundColor).toBe('rgba(0, 0, 0, 0)');
  expect(expandedSurface.borderBottomWidth).toBe('0px');
  expect(expandedSurface.boxShadow).toBe('none');

  const expandedActions = expandedHeader.locator('.tt-browse-header__action');
  expect(await expandedActions.count()).toBeGreaterThanOrEqual(3);
  const actionHeights = await expandedActions.evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().height)),
  );
  expect(actionHeights.every((height) => height >= 44), 'expanded actions retain 44px touch targets').toBe(true);
  await assertNoHorizontalOverflow(page, 'expanded browse header');
  await capture(page, testInfo, 'home-integrated-header');

  await page.evaluate(() => window.scrollTo(0, 120));
  await expect(browseHeader).toHaveAttribute('data-state', 'compact');
  await expect(expandedHeader).toHaveAttribute('aria-hidden', 'true');
  await expect(compactHeader).toHaveAttribute('aria-hidden', 'false');
  await expect(compactHeader).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open menu' })).toBeVisible();

  const compactGeometry = await compactHeader.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      height: Math.round(element.getBoundingClientRect().height),
      borderBottomWidth: style.borderBottomWidth,
      position: style.position,
    };
  });
  expect(compactGeometry.height).toBeGreaterThanOrEqual(56);
  expect(compactGeometry.height).toBeLessThanOrEqual(72);
  expect(compactGeometry.borderBottomWidth).toBe('1px');
  expect(compactGeometry.position).toBe('fixed');
  await assertNoHorizontalOverflow(page, 'compact browse header');
  await capture(page, testInfo, 'home-compact-header');

  for (const [path, title] of [
    ['/tabs/players', 'Players'],
    ['/tabs/leagues', 'Leagues'],
    ['/tabs/h2h', 'H2H'],
    ['/tabs/events', 'Tournaments'],
  ] as const) {
    await page.goto(`${previewUrl}${path}`, { waitUntil: 'domcontentloaded' });
    await page.evaluate(() => window.scrollTo(0, 0));
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await expect(page.locator('.tt-browse-header')).toHaveAttribute('data-state', 'expanded');
    await expect(page.locator('h1')).toHaveCount(1);
    await assertNoHorizontalOverflow(page, `${title} browse header`);
  }

  await page.goto(`${previewUrl}/data-coverage`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('.tt-browse-header')).toHaveCount(0);
  await expect(page.locator('.tt-app-header')).toBeVisible();
  await expect(page.locator('h1')).toHaveCount(1);

  await page.evaluate(() => localStorage.setItem('TTPlayers-Theme', 'dark-mode'));
  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toHaveClass(/theme-dark/);
  await page.evaluate(() => window.scrollTo(0, 120));
  await expect(page.locator('.tt-browse-header')).toHaveAttribute('data-state', 'compact');
  await capture(page, testInfo, 'home-compact-header-dark');

  writeReportIndex(previewUrl);
});
