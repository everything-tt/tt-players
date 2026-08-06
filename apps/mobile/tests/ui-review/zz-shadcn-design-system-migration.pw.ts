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

test.describe.configure({ mode: 'serial' });

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
    localStorage.setItem('TTPlayers-Theme', value);
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
  const entries = readManifest();
  const cards = entries.map((entry) => `
    <article>
      <h2>${escapeHtml(entry.title)}</h2>
      <a href="${escapeHtml(entry.path)}"><img src="${escapeHtml(entry.path)}" alt="${escapeHtml(entry.title)}" /></a>
      <p><a href="${escapeHtml(entry.url)}">${escapeHtml(new URL(entry.url).pathname)}</a></p>
      <p><a href="${escapeHtml(entry.diagnosticsPath)}">Diagnostics</a></p>
    </article>`).join('');
  writeFileSync(join(reportDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT shadcn migration review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f4f7f4;color:#17211d}main{max-width:1100px;margin:auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(270px,1fr));gap:16px}article{background:white;border:1px solid #d9dfda;border-radius:10px;padding:12px}img{display:block;width:100%;height:auto;border:1px solid #d9dfda;border-radius:8px}a{color:#0f6655}
</style></head><body><main><h1>TT shadcn migration review</h1><p><a href="${escapeHtml(previewUrl)}">Preview</a></p><div class="grid">${cards}</div></main></body></html>\n`);
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
    scrollWidth: document.documentElement.scrollWidth,
    activeElement: document.activeElement?.getAttribute('aria-label') ?? document.activeElement?.textContent?.trim().slice(0, 80),
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

test('shadcn-backed TT primitives preserve mobile behaviour and visuals', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page, 'light-mode');
  await page.goto(`${previewUrl}/design-system`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Design System', level: 1 })).toBeVisible();

  expect(await page.locator('[data-slot="button"]').count()).toBeGreaterThan(0);
  await expect(page.locator('[data-slot="input"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="toggle-group"]')).toHaveCount(1);
  await expect(page.locator('[data-slot="switch"]')).toHaveCount(1);
  await assertNoHorizontalOverflow(page, 'component catalogue at 390px');

  const action = page.getByRole('button', { name: 'Action' });
  expect(await action.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBeGreaterThanOrEqual(44);

  const allOption = page.getByRole('radio', { name: 'All' });
  const recentOption = page.getByRole('radio', { name: 'Recent' });
  await allOption.focus();
  await page.keyboard.press('ArrowRight');
  await expect(recentOption).toHaveAttribute('aria-checked', 'true');
  await expect(recentOption).toHaveAttribute('data-state', 'on');

  const catalogueSwitch = page.getByRole('switch', { name: 'Catalogue notifications' });
  await expect(catalogueSwitch).toHaveAttribute('data-state', 'unchecked');
  await catalogueSwitch.click();
  await expect(catalogueSwitch).toHaveAttribute('data-state', 'checked');
  expect(await catalogueSwitch.evaluate((element) => Math.round(element.getBoundingClientRect().height))).toBeGreaterThanOrEqual(32);

  const openSheet = page.getByRole('button', { name: 'Open bottom sheet' });
  await openSheet.scrollIntoViewIfNeeded();
  await capture(page, testInfo, 'catalogue-light');
  await openSheet.click();
  const sheet = page.getByRole('dialog', { name: 'Mobile overlay' });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveAttribute('data-slot', 'dialog-content');
  await expect(sheet).toBeFocused();
  await assertNoHorizontalOverflow(page, 'bottom sheet');
  await capture(page, testInfo, 'bottom-sheet-light');
  await page.keyboard.press('Escape');
  await expect(sheet).toBeHidden();
  await expect(openSheet).toBeFocused();

  await page.setViewportSize({ width: 320, height: 720 });
  await assertNoHorizontalOverflow(page, 'component catalogue at 320px');
  const radioHeights = await page.locator('.tt-segmented__btn').evaluateAll((elements) =>
    elements.map((element) => Math.round(element.getBoundingClientRect().height)),
  );
  expect(radioHeights.every((height) => height >= 44), 'all segmented choices retain a 44px target').toBe(true);
  await capture(page, testInfo, 'catalogue-320');

  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => localStorage.setItem('TTPlayers-Theme', 'dark-mode'));
  await page.goto(`${previewUrl}/design-system`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Design System', level: 1 })).toBeVisible();
  const darkBackground = await page.evaluate(() => getComputedStyle(document.body).getPropertyValue('--background').trim());
  expect(darkBackground).toContain('canvas-parchment');
  await assertNoHorizontalOverflow(page, 'dark component catalogue');
  await capture(page, testInfo, 'catalogue-dark');

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  const openMenu = page.getByRole('button', { name: 'Open menu' });
  await expect(openMenu).toBeVisible();
  await openMenu.click();
  const drawer = page.getByRole('dialog', { name: 'TT Players' });
  await expect(drawer).toBeVisible();
  await expect(drawer).toHaveAttribute('data-slot', 'drawer-content');
  await expect(drawer.getByRole('button', { name: 'Close menu' })).toBeFocused();
  await expect(drawer.getByRole('switch', { name: 'Dark mode' })).toHaveAttribute('data-state', 'checked');
  await assertNoHorizontalOverflow(page, 'main drawer');
  await capture(page, testInfo, 'main-drawer-dark');
  await page.keyboard.press('Escape');
  await expect(drawer).toBeHidden();
  await expect(openMenu).toBeFocused();

  writeReportIndex(previewUrl);
});
