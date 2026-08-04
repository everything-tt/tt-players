import { expect, test } from '@playwright/test';
import type { Page, TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * PR-focused UI review for shared design-system contracts:
 *  - semantic tokens resolve correctly in dark and light themes
 *  - root shell/header/tab-bar geometry is package-owned and visible
 *  - four-column metric groups reflow without clipping on mobile
 *  - the package-owned league scope sheet preserves fixed controls and actions
 *  - the Leagues dashboard composes shared primitives without internal overrides
 *  - segmented controls retain the 44px touch-target minimum
 *  - full-route pages expose one h1 landmark
 */

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
  await page.addInitScript((t) => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('tt_players_favourite_tournaments', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', t);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  }, theme);
}

function readManifest(): ScreenshotEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    return Array.isArray(parsed) ? (parsed as ScreenshotEntry[]) : [];
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
  const groups = entries.reduce<Record<string, ScreenshotEntry[]>>((acc, entry) => {
    acc[entry.project] = acc[entry.project] ?? [];
    acc[entry.project].push(entry);
    return acc;
  }, {});
  const sections = Object.entries(groups).map(([project, items]) => `
    <section>
      <h2>${escapeHtml(project)}</h2>
      <div class="grid">
        ${items.map((item) => `
          <article>
            <h3>${escapeHtml(item.title)}</h3>
            <a href="${escapeHtml(item.path)}"><img src="${escapeHtml(item.path)}" alt="${escapeHtml(`${project} ${item.title}`)}" /></a>
            <p><a href="${escapeHtml(item.url)}">${escapeHtml(new URL(item.url).pathname)}</a></p>
            <p><a href="${escapeHtml(item.diagnosticsPath)}">Diagnostics</a></p>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');
  writeFileSync(join(reportDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT Players UI Review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1180px;margin:0 auto;padding:24px}
h1,h2,h3{margin:0 0 12px}header,section{margin-bottom:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
article{background:white;border:1px solid #d9dfda;border-radius:8px;padding:12px}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:6px;display:block}a{color:#0f6655}code{background:#eef2ef;padding:2px 5px;border-radius:4px}
</style></head><body><main><header><h1>TT Players UI Review</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><p>Commit: <code>${escapeHtml(process.env.GITHUB_SHA ?? 'local')}</code></p></header>${sections}</main></body></html>\n`);
}

async function settleForScreenshot(page: Page) {
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

async function capture(page: Page, testInfo: TestInfo, title: string) {
  await settleForScreenshot(page);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), finalUrl: page.url(), events: [] }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

/** Resolve a CSS custom property to its computed value on body. */
async function tokenOnBody(page: Page, name: string): Promise<string> {
  return page.evaluate((n) => getComputedStyle(document.body).getPropertyValue(n).trim(), name);
}

async function assertRootShellContract(page: Page) {
  const rootHeader = page.locator('.tt-root-header');
  await expect(rootHeader).toBeVisible();
  const headerHeight = await rootHeader.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  expect(headerHeight, 'expanded root header should use the compact design-system shell token').toBeGreaterThanOrEqual(56);
  expect(headerHeight, 'expanded root header must not regress to the legacy 96px app-owned geometry').toBeLessThanOrEqual(72);

  const tabIcons = page.locator('#footer-bar.tt-tab-bar .tt-tab-bar__icon');
  await expect(tabIcons).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) {
    await expect(tabIcons.nth(index), `tab icon ${index + 1} should remain visible`).toBeVisible();
  }
}

async function assertResponsiveMetricContract(page: Page, selector: string, description: string) {
  const metricGrid = page.locator(selector);
  await expect(metricGrid).toBeVisible();
  await expect(metricGrid.locator('.tt-metric')).toHaveCount(4);

  const columnCount = await metricGrid.evaluate((el) => {
    const template = getComputedStyle(el).gridTemplateColumns.trim();
    return template ? template.split(/\s+/).length : 0;
  });
  expect(columnCount, `${description} should reflow to a 2-column mobile grid`).toBe(2);

  const overflowedValues = await metricGrid.locator('.tt-metric__value').evaluateAll((elements) =>
    elements.filter((element) => element.scrollWidth > element.clientWidth + 1).map((element) => element.textContent),
  );
  expect(overflowedValues, `${description} values must not be clipped or ellipsized`).toEqual([]);
}

test('design-system shell, tokens, metrics and route landmarks remain intact', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();

  // Dark-theme tokens and package-owned shell contracts.
  await prepareAppState(page, 'dark-mode');
  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await assertRootShellContract(page);
  await assertResponsiveMetricContract(page, '.tt-home-summary-metrics', 'Home summary metrics');

  const ttTextMuted = await tokenOnBody(page, '--tt-text-muted');
  const ttTextPrimary = await tokenOnBody(page, '--tt-text-primary');
  const ttSurfaceCanvas = await tokenOnBody(page, '--tt-surface-canvas');
  const ttBorder = await tokenOnBody(page, '--tt-border');

  expect(ttTextMuted, 'dark --tt-text-muted must be light (~94%), not frozen to light-mode 21%').toContain('94%');
  expect(ttTextPrimary, 'dark --tt-text-primary must be light (~94%)').toContain('94%');
  expect(ttSurfaceCanvas, 'dark --tt-surface-canvas must be dark (~20%)').toContain('20%');
  expect(ttBorder, 'dark --tt-border must be the light-on-dark hairline (~94%)').toContain('94%');

  const subColor = await page.evaluate(() => {
    const el = [...document.querySelectorAll<HTMLElement>('*')].find(
      (e) => /Sign in to unlock your profile/.test(e.textContent ?? '') && e.children.length === 0,
    );
    return el ? getComputedStyle(el).color : '';
  });
  expect(subColor, 'dark secondary text must not be the frozen light-mode dark ink').not.toContain('0.21');

  const signInButton = page.getByRole('button', { name: 'Sign in with Google' });
  await expect(signInButton).toBeVisible();
  await signInButton.scrollIntoViewIfNeeded();
  const [buttonBox, tabBarBox] = await Promise.all([
    signInButton.boundingBox(),
    page.locator('#footer-bar.tt-tab-bar').boundingBox(),
  ]);
  expect(buttonBox).not.toBeNull();
  expect(tabBarBox).not.toBeNull();
  expect(buttonBox!.y + buttonBox!.height, 'page bottom inset must keep the CTA above the fixed tab bar')
    .toBeLessThanOrEqual(tabBarBox!.y);

  await capture(page, testInfo, 'home-dark-mode-tokens');

  // The package-owned page sheet keeps 44px controls and can complete a real
  // league selection without page-level primitive overrides.
  await page.goto(`${previewUrl}/tabs/leagues`, { waitUntil: 'domcontentloaded' });
  const openLeagueScope = page.locator('.tt-leagues-dashboard-empty').getByRole('button', { name: 'Select leagues' });
  await expect(openLeagueScope).toBeVisible();
  await openLeagueScope.click();
  const doneButton = page.getByRole('button', { name: 'Done' });
  await expect(doneButton).toBeVisible();
  const segmentedButton = page.locator('.tt-segmented__btn').first();
  await expect(segmentedButton).toBeVisible();
  const segHeight = await segmentedButton.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  expect(segHeight, 'segmented control buttons must meet the 44px touch-target minimum').toBeGreaterThanOrEqual(44);
  await capture(page, testInfo, 'leagues-segmented-touch-target');

  const firstLeague = page.locator('.tt-league-scope__content .tt-list-item__clickable').first();
  await expect(firstLeague).toBeVisible();
  await firstLeague.click();
  await expect(doneButton).toBeEnabled();
  await doneButton.click();
  await expect(page.getByRole('heading', { name: 'Your leagues', level: 2 })).toBeVisible();
  await assertResponsiveMetricContract(
    page,
    '.tt-leagues-dashboard-hero .tt-metric-grid',
    'Leagues dashboard hero metrics',
  );
  await capture(page, testInfo, 'leagues-dashboard-design-system');

  // Full-route pages expose exactly one h1.
  for (const path of ['/data-coverage', '/tabs/home/ratings']) {
    await page.goto(`${previewUrl}${path}`, { waitUntil: 'domcontentloaded' });
    await expect(page.locator('h1')).toHaveCount(1);
  }
  await page.goto(`${previewUrl}/data-coverage`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Data Coverage', level: 1 })).toBeVisible();
  await capture(page, testInfo, 'data-coverage-h1');

  // Light-mode sanity repeats the shared shell/metric checks.
  await prepareAppState(page, 'light-mode');
  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await assertRootShellContract(page);
  await assertResponsiveMetricContract(page, '.tt-home-summary-metrics', 'Home summary metrics');
  const lightTextMuted = await tokenOnBody(page, '--tt-text-muted');
  expect(lightTextMuted, 'light --tt-text-muted must be the dark ink (~21%)').toContain('21%');
  await capture(page, testInfo, 'home-light-mode-tokens');

  writeReportIndex(previewUrl);
});
