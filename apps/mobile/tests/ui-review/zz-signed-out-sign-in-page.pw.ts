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

async function prepareAppState(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });
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
  const sections = Object.entries(groups)
    .map(
      ([project, items]) => `
    <section>
      <h2>${escapeHtml(project)}</h2>
      <div class="grid">
        ${items
          .map(
            (item) => `
          <article>
            <h3>${escapeHtml(item.title)}</h3>
            <a href="${escapeHtml(item.path)}"><img src="${escapeHtml(item.path)}" alt="${escapeHtml(`${project} ${item.title}`)}" /></a>
            <p><a href="${escapeHtml(item.url)}">${escapeHtml(new URL(item.url).pathname)}</a></p>
            <p><a href="${escapeHtml(item.diagnosticsPath)}">Diagnostics</a></p>
          </article>
        `,
          )
          .join('')}
      </div>
    </section>
  `,
    )
    .join('');
  writeFileSync(
    join(reportDir, 'index.html'),
    `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT Players UI Review</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1180px;margin:0 auto;padding:24px}
h1,h2,h3{margin:0 0 12px}header,section{margin-bottom:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
article{background:white;border:1px solid #d9dfda;border-radius:8px;padding:12px}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:6px;display:block}a{color:#0f6655}code{background:#eef2ef;padding:2px 5px;border-radius:4px}
</style></head><body><main><header><h1>TT Players UI Review</h1><p>Preview: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><p>Commit: <code>${escapeHtml(process.env.GITHUB_SHA ?? 'local')}</code></p></header>${sections}</main></body></html>\n`,
  );
}

async function settleForScreenshot(page: Page) {
  await page.addStyleTag({
    content:
      '* { transition: none !important; animation: none !important; caret-color: transparent !important; }',
  });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

async function capture(page: Page, testInfo: TestInfo, title: string) {
  await settleForScreenshot(page);
  const screenshotPath = `screenshots/${testInfo.project.name}-${title}.png`;
  const diagnosticsPath = `diagnostics/${testInfo.project.name}-${title}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(
    join(reportDir, diagnosticsPath),
    `${JSON.stringify({ route: page.url(), finalUrl: page.url(), events: [] }, null, 2)}\n`,
  );
  appendManifest({
    project: testInfo.project.name,
    title,
    url: page.url(),
    path: screenshotPath,
    diagnosticsPath,
  });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('reviews signed-out Home setup and dedicated sign-in page', async ({
  page,
}, testInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);

  await page.goto(`${previewUrl}/tabs/home`, { waitUntil: 'domcontentloaded' });

  // 1. Verify the current signed-out Home setup state.
  await expect(page.getByRole('heading', { name: 'Make TT Players yours' })).toBeVisible();
  await expect(page.getByText('Personal dashboard', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Claim my player' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose leagues' })).toBeVisible();

  // Confirm inline "Sign in with Google" button is removed from Home tab
  await expect(page.getByRole('button', { name: /Sign in with Google/i })).toHaveCount(0);

  // Capture Home tab signed-out state
  await capture(page, testInfo, 'home-signed-out-setup');

  // 2. Open the dedicated sign-in page directly. The preview may omit public
  // Supabase configuration, so verify the safe unavailable state as well as
  // the configured Google sign-in state when it is present.
  await page.goto(`${previewUrl}/tabs/home/sign-in`, { waitUntil: 'domcontentloaded' });
  await expect(page).toHaveURL(/\/tabs\/home\/sign-in\/?$/);

  // 3. Verify dedicated Sign In page content.
  await expect(page.getByRole('heading', { name: 'Sign in to TT Players' })).toBeVisible();
  const dedicatedGoogleBtn = page.getByRole('button', { name: 'Sign in with Google' });
  const unavailableHeading = page.getByRole('heading', { name: 'Account sign-in unavailable' });
  await expect(dedicatedGoogleBtn.or(unavailableHeading)).toBeVisible();

  if (await dedicatedGoogleBtn.isVisible()) {
    await expect(page.getByText('Claim your player profile')).toBeVisible();
    await expect(page.getByText('Save favourite players & teams')).toBeVisible();
  } else {
    await expect(unavailableHeading).toBeVisible();
    await expect(page.getByText(/Supabase authentication is not configured/)).toBeVisible();
  }

  // Capture Dedicated Sign In page
  await capture(page, testInfo, 'dedicated-sign-in-page');

  writeReportIndex(previewUrl);
});
