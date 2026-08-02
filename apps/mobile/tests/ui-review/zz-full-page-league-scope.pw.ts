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

const leagues = [
  {
    id: 'british-league',
    name: 'British League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'national', slug: 'national', name: 'National' }],
    divisions: [{ id: 'premier', name: 'Premier Division' }, { id: 'championship', name: 'Championship' }],
  },
  {
    id: 'bristol-league',
    name: 'Bristol & District League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'south-west', slug: 'south-west', name: 'South West' }],
    divisions: [{ id: 'bristol-premier', name: 'Premier Division' }, { id: 'bristol-one', name: 'Division One' }],
  },
  {
    id: 'birmingham-league',
    name: 'Birmingham & District League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'west-midlands', slug: 'west-midlands', name: 'West Midlands' }],
    divisions: [{ id: 'birmingham-premier', name: 'Premier Division' }],
  },
  {
    id: 'colchester-league',
    name: 'Colchester & District League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'east-england', slug: 'east-england', name: 'East of England' }],
    divisions: [{ id: 'colchester-one', name: 'Division One' }, { id: 'colchester-two', name: 'Division Two' }],
  },
  {
    id: 'chelmsford-league',
    name: 'Chelmsford League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'east-england', slug: 'east-england', name: 'East of England' }],
    divisions: [{ id: 'chelmsford-one', name: 'Division One' }],
  },
  {
    id: 'london-league',
    name: 'London League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'london', slug: 'london', name: 'London' }],
    divisions: [{ id: 'london-premier', name: 'Premier Division' }],
  },
  {
    id: 'kent-league',
    name: 'Kent County League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'south-east', slug: 'south-east', name: 'South East' }],
    divisions: [{ id: 'kent-one', name: 'Division One' }],
  },
  {
    id: 'surrey-league',
    name: 'Surrey League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'south-east', slug: 'south-east', name: 'South East' }],
    divisions: [{ id: 'surrey-premier', name: 'Premier Division' }],
  },
  {
    id: 'manchester-league',
    name: 'Manchester League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'north-west', slug: 'north-west', name: 'North West' }],
    divisions: [{ id: 'manchester-one', name: 'Division One' }],
  },
  {
    id: 'liverpool-league',
    name: 'Liverpool League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'north-west', slug: 'north-west', name: 'North West' }],
    divisions: [{ id: 'liverpool-one', name: 'Division One' }],
  },
  {
    id: 'yorkshire-league',
    name: 'Yorkshire League',
    platform: 'Table Tennis 365',
    season: '2025/26',
    regions: [{ id: 'yorkshire', slug: 'yorkshire', name: 'Yorkshire' }],
    divisions: [{ id: 'yorkshire-premier', name: 'Premier Division' }],
  },
  {
    id: 'scottish-league',
    name: 'Scottish National League',
    platform: 'Table Tennis Scotland',
    season: '2025/26',
    regions: [{ id: 'scotland', slug: 'scotland', name: 'Scotland' }],
    divisions: [{ id: 'scotland-one', name: 'Division One' }],
  },
];

function requirePreviewUrl(): string {
  const previewUrl = process.env.PREVIEW_URL;
  if (!previewUrl) throw new Error('PREVIEW_URL is required');
  return previewUrl.replace(/\/$/, '');
}

async function prepareApp(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([
      'british-league',
      'bristol-league',
      'colchester-league',
    ]));
    localStorage.setItem('tt_players_favourite_players', JSON.stringify([]));
    localStorage.removeItem('tt_players_my_player');
    localStorage.removeItem('tt_players_local_data_backup_v1');
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });

  await page.route('**/api/leagues*', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/api/leagues')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ data: leagues }),
      });
      return;
    }
    await route.continue();
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
      <h2>${escapeHtml(entry.title)}</h2>
      <a href="${escapeHtml(entry.path)}"><img src="${escapeHtml(entry.path)}" alt="${escapeHtml(entry.title)}" /></a>
      <p><a href="${escapeHtml(entry.url)}">Open preview route</a></p>
      <p><a href="${escapeHtml(entry.diagnosticsPath)}">Diagnostics</a></p>
    </article>
  `).join('');
  writeFileSync(join(reportDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>League scope UI review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1100px;margin:0 auto;padding:24px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:#fff;border:1px solid #d9dfda;border-radius:10px;padding:12px}img{display:block;width:100%;height:auto;border:1px solid #d9dfda;border-radius:8px}a{color:#0f6655}code{background:#eef2ef;padding:2px 5px;border-radius:4px}
</style></head><body><main><h1>Full-page league scope</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><p>Commit: <code>${escapeHtml(process.env.GITHUB_SHA ?? 'local')}</code></p><div class="grid">${cards}</div></main></body></html>\n`);
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
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  const diagnostics = await page.getByRole('dialog', { name: 'League scope' }).evaluate((dialog) => {
    const rect = dialog.getBoundingClientRect();
    const footer = dialog.querySelector<HTMLElement>('.tt-sheet__footer')?.getBoundingClientRect();
    return {
      viewport: { width: window.innerWidth, height: window.innerHeight },
      dialog: { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height },
      footer: footer ? { top: footer.top, bottom: footer.bottom, height: footer.height } : null,
      horizontalOverflow: dialog.scrollWidth > dialog.clientWidth + 1,
    };
  });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), finalUrl: page.url(), diagnostics }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

async function expectFullPageDialog(page: Page) {
  const dialog = page.getByRole('dialog', { name: 'League scope' });
  await expect(dialog).toBeVisible();
  const geometry = await dialog.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    const footer = element.querySelector<HTMLElement>('.tt-sheet__footer')?.getBoundingClientRect();
    return {
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      noHorizontalOverflow: element.scrollWidth <= element.clientWidth + 1,
      footerVisible: Boolean(footer && footer.top >= 0 && footer.bottom <= window.innerHeight + 1),
    };
  });

  expect(geometry.top).toBeLessThanOrEqual(1);
  expect(geometry.left).toBeLessThanOrEqual(1);
  expect(geometry.right).toBeGreaterThanOrEqual(geometry.viewportWidth - 1);
  expect(geometry.bottom).toBeGreaterThanOrEqual(geometry.viewportHeight - 1);
  expect(geometry.width).toBeGreaterThanOrEqual(geometry.viewportWidth - 2);
  expect(geometry.height).toBeGreaterThanOrEqual(geometry.viewportHeight - 2);
  expect(geometry.noHorizontalOverflow).toBe(true);
  expect(geometry.footerVisible).toBe(true);
  await expect(dialog.getByRole('button', { name: 'Done' })).toBeVisible();
  return dialog;
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('keeps league scope usable through browsing, typing, tab changes and a narrow viewport', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareApp(page);

  await page.goto(`${previewUrl}/tabs/leagues`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: /Select leagues, 3 selected/i })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: /Select leagues, 3 selected/i }).click();

  const dialog = await expectFullPageDialog(page);
  await expect(dialog.getByRole('heading', { name: 'Selected leagues' })).toBeVisible();
  await expect(dialog.getByText('3 of 15 leagues selected.')).toBeVisible();
  await capture(page, testInfo, 'league-scope-selected');

  await dialog.getByRole('radio', { name: 'Leagues' }).click();
  await expect(dialog.getByRole('heading', { name: 'All leagues' })).toBeVisible();
  await expect(dialog.locator('.tt-list-item__title')).toHaveCount(leagues.length);

  const search = dialog.getByRole('textbox', { name: 'Search leagues or areas' });
  await search.click();
  await search.pressSequentially('Bristol', { delay: 45 });
  await expect(search).toHaveValue('Bristol');
  await expect(dialog.locator('.tt-list-item__title', { hasText: 'Bristol & District League' })).toBeVisible();
  await expect(dialog.locator('.tt-list-item__title', { hasText: 'British League' })).toHaveCount(0);
  await expect(dialog.getByText('1 result for “Bristol”')).toBeVisible();
  await capture(page, testInfo, 'league-scope-multi-character-search');

  await dialog.getByRole('radio', { name: 'Areas' }).click();
  await expect(search).toHaveValue('Bristol');
  await dialog.getByRole('button', { name: 'Clear search' }).click();
  await expect(search).toHaveValue('');
  await expect(dialog.getByRole('heading', { name: 'Areas' })).toBeVisible();
  await expect(dialog.getByText('East of England')).toBeVisible();

  const footerTopBeforeScroll = await dialog.locator('.tt-sheet__footer').evaluate((element) => element.getBoundingClientRect().top);
  await dialog.locator('.tt-sheet__body').evaluate((element) => { element.scrollTop = element.scrollHeight; });
  const footerTopAfterScroll = await dialog.locator('.tt-sheet__footer').evaluate((element) => element.getBoundingClientRect().top);
  expect(Math.abs(footerTopAfterScroll - footerTopBeforeScroll)).toBeLessThan(1);

  await page.setViewportSize({ width: 360, height: 780 });
  await expectFullPageDialog(page);
  await expect(dialog.getByText('3 of 15 leagues selected.')).toBeVisible();
  await capture(page, testInfo, 'league-scope-areas-narrow');

  writeReportIndex(previewUrl);
});
