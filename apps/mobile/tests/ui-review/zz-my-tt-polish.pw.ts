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
const player = { id: 'my-tt-polish-player', name: 'Wudong Liu' };
const userId = '11111111-1111-4111-8111-111111111111';
const email = 'my-tt-polish@example.test';

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
  const cards = readManifest().map((entry) => `
    <article>
      <h2>${escapeHtml(`${entry.project}: ${entry.title}`)}</h2>
      <a href="${escapeHtml(entry.path)}"><img src="${escapeHtml(entry.path)}" alt="${escapeHtml(entry.title)}" /></a>
      <p><a href="${escapeHtml(entry.url)}">Open page</a> · <a href="${escapeHtml(entry.diagnosticsPath)}">Diagnostics</a></p>
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
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: page.url(), diagnostics }, null, 2)}\n`);
  appendManifest({ project: testInfo.project.name, title, url: page.url(), path: screenshotPath, diagnosticsPath });
}

function base64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

async function discoverSupabaseUrl(page: Page, previewUrl: string): Promise<string> {
  const response = await page.request.get(previewUrl);
  if (!response.ok()) throw new Error(`Unable to load preview HTML: ${response.status()}`);
  const html = await response.text();
  const scriptSources = Array.from(
    html.matchAll(/<script[^>]+src=["']([^"']+\.js[^"']*)["']/gi),
    (match) => match[1],
  );

  for (const source of scriptSources) {
    const scriptUrl = new URL(source, previewUrl).toString();
    const script = await (await page.request.get(scriptUrl)).text();
    const match = script.match(/https:\/\/[a-z0-9-]+\.supabase\.co/i);
    if (match?.[0]) return match[0];
  }

  throw new Error('Unable to discover the Supabase project URL from the preview bundle');
}

function buildSyntheticSession(supabaseUrl: string) {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + 60 * 60;
  const user = {
    id: userId,
    aud: 'authenticated',
    role: 'authenticated',
    email,
    email_confirmed_at: new Date(now * 1000).toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: new Date(now * 1000).toISOString(),
    updated_at: new Date(now * 1000).toISOString(),
  };
  const accessToken = [
    base64Url({ alg: 'HS256', typ: 'JWT' }),
    base64Url({
      aud: 'authenticated',
      exp: expiresAt,
      iat: now,
      iss: `${supabaseUrl}/auth/v1`,
      role: 'authenticated',
      sub: userId,
      email,
    }),
    'synthetic-signature',
  ].join('.');

  return {
    access_token: accessToken,
    refresh_token: 'synthetic-refresh-token',
    token_type: 'bearer',
    expires_in: 60 * 60,
    expires_at: expiresAt,
    user,
  };
}

async function installSyntheticSession(
  page: Page,
  previewUrl: string,
  supabaseUrl: string,
  session: ReturnType<typeof buildSyntheticSession>,
) {
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const storageKey = `sb-${projectRef}-auth-token`;
  await page.context().addCookies([{
    name: storageKey,
    value: encodeURIComponent(JSON.stringify(session)),
    url: previewUrl,
    secure: true,
    sameSite: 'Lax',
    expires: session.expires_at + 60 * 60,
  }]);
}

function fullProfile() {
  return {
    version: 1,
    playerId: player.id,
    playerName: player.name,
    updatedAt: '2026-08-03T12:00:00.000Z',
    bio: 'Love competing, learning and improving every week.',
    playingStyle: 'all-round',
    dominantShot: 'Forehand loop',
    grip: 'Shakehand',
    preferredPosition: 'Close to table',
    hand: 'right',
    playingSince: '2012',
    highestRating: '2100',
    characteristics: ['Consistent', 'Strong serves', 'Tactical'],
    equipment: {
      blade: 'Butterfly Viscaria',
      forehandRubber: 'Dignics 05 (2.1)',
      backhandRubber: 'Dignics 64 (2.1)',
      shoes: 'Asics Attack Dominate FF 2',
    },
  };
}

async function mockApi(page: Page, syntheticSession: ReturnType<typeof buildSyntheticSession>) {
  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({ json: url.pathname.endsWith('/user') ? syntheticSession.user : syntheticSession });
  });

  await page.route('**/api/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === `/api/players/${player.id}/stats/extended`) {
      await route.fulfill({
        json: {
          player_id: player.id,
          player_name: player.name,
          wins: 164,
          losses: 132,
          total: 296,
        },
      });
      return;
    }

    if (url.pathname === '/api/me/sync-state/bootstrap' || url.pathname === '/api/me/sync-state') {
      const snapshot = route.request().postDataJSON() as unknown;
      await route.fulfill({
        json: {
          data: snapshot,
          updated_at: new Date().toISOString(),
          source: url.pathname.endsWith('/bootstrap') ? 'local' : 'server',
        },
      });
      return;
    }

    await route.fulfill({ json: { data: [] } });
  });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test.afterAll(() => {
  writeReportIndex(requirePreviewUrl());
});

test('keeps My TT compact and gives editing a persistent save state', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  const supabaseUrl = await discoverSupabaseUrl(page, previewUrl);
  const syntheticSession = buildSyntheticSession(supabaseUrl);
  await mockApi(page, syntheticSession);
  await installSyntheticSession(page, previewUrl, supabaseUrl, syntheticSession);

  await page.addInitScript(({ claimedPlayer, savedProfile }) => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    localStorage.setItem('tt_players_my_player', JSON.stringify(claimedPlayer));
    localStorage.setItem('tt_players_my_tt_profile', JSON.stringify(savedProfile));
  }, { claimedPlayer: player, savedProfile: fullProfile() });

  await page.goto(`${previewUrl}/tabs/home/my-tt`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: player.name })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Edit My TT' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More My TT actions' })).toBeVisible();
  await expect(page.locator('.tt-my-tt-metrics > div')).toHaveCount(3);
  await expect(page.locator('.tt-my-tt-support-card')).toHaveCount(3);
  await expect(page.getByText('Butterfly Viscaria')).toBeVisible();
  await expect(page.getByText('My TT details are account-owned', { exact: false })).toBeVisible();

  const filledGeometry = await page.evaluate(() => {
    const hero = document.querySelector<HTMLElement>('.tt-my-tt-hero')!.getBoundingClientRect();
    const cards = Array.from(document.querySelectorAll<HTMLElement>('.tt-my-tt-support-card'))
      .map((card) => card.getBoundingClientRect().height);
    return {
      viewport: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      heroHeight: hero.height,
      supportCardHeights: cards,
    };
  });
  expect(filledGeometry.scrollWidth).toBeLessThanOrEqual(filledGeometry.viewport + 1);
  expect(filledGeometry.heroHeight).toBeLessThan(330);
  expect(Math.max(...filledGeometry.supportCardHeights)).toBeLessThan(260);
  await capture(page, testInfo, 'my-tt-compact-profile', filledGeometry);

  await page.evaluate(() => localStorage.removeItem('tt_players_my_tt_profile'));
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByText('Complete your playing profile')).toBeVisible({ timeout: 30_000 });
  await expect(page.locator('.tt-my-tt-card-prompt')).toHaveCount(3);

  const emptyGeometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    promptHeights: Array.from(document.querySelectorAll<HTMLElement>('.tt-my-tt-card-prompt'))
      .map((prompt) => prompt.getBoundingClientRect().height),
  }));
  expect(emptyGeometry.scrollWidth).toBeLessThanOrEqual(emptyGeometry.viewport + 1);
  expect(Math.max(...emptyGeometry.promptHeights)).toBeLessThan(100);
  await capture(page, testInfo, 'my-tt-compact-empty-states', emptyGeometry);

  await page.evaluate((savedProfile) => {
    localStorage.setItem('tt_players_my_tt_profile', JSON.stringify(savedProfile));
  }, fullProfile());
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Edit My TT' }).click();

  await expect(page).toHaveURL(/\/tabs\/home\/my-tt\/edit$/);
  await expect(page.getByText('Edit My TT', { exact: true }).first()).toBeVisible();
  await expect(page.locator('.tt-my-tt-edit-card')).toHaveCount(4);
  await expect(page.getByLabel('Dominant shot')).toHaveValue('Forehand loop');
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  const controlGeometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    chipHeight: document.querySelector<HTMLElement>('.tt-my-tt-chip')!.getBoundingClientRect().height,
    selectHeight: document.querySelector<HTMLSelectElement>('#tt-my-tt-dominant-shot')!.getBoundingClientRect().height,
  }));
  expect(controlGeometry.scrollWidth).toBeLessThanOrEqual(controlGeometry.viewport + 1);
  expect(controlGeometry.chipHeight).toBeLessThanOrEqual(48);
  expect(controlGeometry.selectHeight).toBeLessThanOrEqual(56);

  await page.getByRole('button', { name: /Attacking/ }).click();
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeEnabled();
  await capture(page, testInfo, 'my-tt-polished-editor', controlGeometry);

  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Saved just now')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  const storage = await page.evaluate(() => ({
    claim: JSON.parse(localStorage.getItem('tt_players_my_player') ?? 'null') as unknown,
    profile: JSON.parse(localStorage.getItem('tt_players_my_tt_profile') ?? 'null') as unknown,
  }));
  expect(storage.claim).toMatchObject({ id: player.id, name: player.name });
  expect(storage.profile).toMatchObject({
    playerId: player.id,
    playerName: player.name,
    playingStyle: 'attacking',
  });
});
