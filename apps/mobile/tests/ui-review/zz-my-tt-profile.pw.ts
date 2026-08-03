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
const player = { id: 'my-tt-review-player', name: 'Wudong Liu' };
const userId = '11111111-1111-4111-8111-111111111111';
const email = 'my-tt-review@example.test';

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
    phone: '',
    confirmed_at: new Date(now * 1000).toISOString(),
    last_sign_in_at: new Date(now * 1000).toISOString(),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {},
    identities: [],
    created_at: new Date(now * 1000).toISOString(),
    updated_at: new Date(now * 1000).toISOString(),
    is_anonymous: false,
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

async function mockApi(page: Page, syntheticSession: ReturnType<typeof buildSyntheticSession>) {
  await page.route('**/auth/v1/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith('/user')) {
      await route.fulfill({ json: syntheticSession.user });
      return;
    }
    await route.fulfill({ json: syntheticSession });
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

async function setClaimedProfile(page: Page) {
  await page.evaluate(({ claimedPlayer }) => {
    sessionStorage.setItem('tt_test_keep_my_tt', 'true');
    localStorage.setItem('tt_players_my_player', JSON.stringify(claimedPlayer));
    localStorage.setItem('tt_players_my_tt_profile', JSON.stringify({
      version: 1,
      playerId: claimedPlayer.id,
      playerName: claimedPlayer.name,
      updatedAt: '2026-08-03T10:00:00.000Z',
      bio: 'Love competing, learning and improving every week.',
      playingStyle: 'all-round',
      dominantShot: 'Forehand loop',
      grip: 'Shakehand',
      preferredPosition: 'Mid distance',
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
    }));
  }, { claimedPlayer: player });
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test.afterAll(() => {
  writeReportIndex(requirePreviewUrl());
});

test('gates My TT behind account and claim, then edits separately from the public player', async ({ page }, testInfo) => {
  const previewUrl = requirePreviewUrl();
  const supabaseUrl = await discoverSupabaseUrl(page, previewUrl);
  const syntheticSession = buildSyntheticSession(supabaseUrl);
  await mockApi(page, syntheticSession);
  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
    if (sessionStorage.getItem('tt_test_keep_my_tt') !== 'true') {
      localStorage.removeItem('tt_players_my_player');
      localStorage.removeItem('tt_players_my_tt_profile');
    }
  });

  await page.goto(`${previewUrl}/tabs/home/my-tt`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Sign in to use My TT' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Sign in with Google' })).toBeVisible();
  await capture(page, testInfo, 'my-tt-sign-in-required', { signedIn: false, claimed: false });

  await installSyntheticSession(page, previewUrl, supabaseUrl, syntheticSession);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Claim your player first' })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Find my player' })).toBeVisible();
  await expect(page.getByText('Sign in to use My TT')).toHaveCount(0);

  await setClaimedProfile(page);
  await page.reload({ waitUntil: 'domcontentloaded' });

  await expect(page.getByRole('heading', { name: player.name })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Edit My TT' })).toBeVisible();
  await expect(page.getByText('Separate from your public player record')).toBeVisible();
  await expect(page.getByText('Butterfly Viscaria')).toBeVisible();
  await expect(page.locator('input, select, textarea')).toHaveCount(0);

  const viewGeometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
  }));
  expect(viewGeometry.scrollWidth).toBeLessThanOrEqual(viewGeometry.viewport + 1);
  await capture(page, testInfo, 'my-tt-profile', viewGeometry);

  await page.getByRole('button', { name: 'Edit My TT' }).click();
  await expect(page).toHaveURL(/\/tabs\/home\/my-tt\/edit$/);
  await expect(page.getByText('Edit My TT', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Official player identity and match data are read-only here.')).toBeVisible();
  await expect(page.getByText('Saved separately')).toBeVisible();
  await expect(page.getByLabel('Dominant shot')).toHaveValue('Forehand loop');
  await expect(page.getByLabel('Blade')).toHaveValue('Butterfly Viscaria');

  await page.getByRole('button', { name: /Attacking/ }).click();
  await page.getByLabel('Short introduction').fill('Attacking player focused on a stronger third-ball game.');
  await page.getByRole('button', { name: 'Fast attacker' }).click();

  const editGeometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    selectedChips: document.querySelectorAll('[aria-pressed="true"]').length,
  }));
  expect(editGeometry.scrollWidth).toBeLessThanOrEqual(editGeometry.viewport + 1);
  expect(editGeometry.selectedChips).toBeGreaterThan(0);
  await capture(page, testInfo, 'my-tt-edit-playing-style', editGeometry);

  await page.getByRole('button', { name: 'Save My TT profile' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Save My TT profile' }).click();
  await expect(page.getByRole('status')).toHaveText('My TT profile saved to your account.');

  const storage = await page.evaluate(() => ({
    claim: JSON.parse(localStorage.getItem('tt_players_my_player') ?? 'null') as unknown,
    profile: JSON.parse(localStorage.getItem('tt_players_my_tt_profile') ?? 'null') as unknown,
  }));
  expect(storage.claim).toMatchObject({ id: player.id, name: player.name });
  expect(storage.profile).toMatchObject({
    playerId: player.id,
    playerName: player.name,
    playingStyle: 'attacking',
    bio: 'Attacking player focused on a stronger third-ball game.',
  });

  await capture(page, testInfo, 'my-tt-saved-separately', storage);
});
