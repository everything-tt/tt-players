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
const player = { id: 'my-tt-detail-player', name: 'Wudong Liu' };
const userId = '11111111-1111-4111-8111-111111111111';
const email = 'my-tt-detail-polish@example.test';

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
    updatedAt: '2026-08-03T18:00:00.000Z',
    bio: 'Playing table tennis for 30+ years. Love every detail of speed and spin.',
    playingStyle: 'all-round',
    dominantShot: 'Forehand loop',
    grip: 'Shakehand',
    preferredPosition: 'Close to table',
    hand: 'right',
    playingSince: '1994',
    highestRating: '2100',
    characteristics: ['Consistent', 'Tactical'],
    equipment: {
      blade: 'Butterfly Harimoto Super ALC',
      forehandRubber: 'Evolution MX-P',
      backhandRubber: 'Evolution MX-P',
      shoes: 'Butterfly shoes',
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

test('presents richer player details and returns to My TT after save', async ({ page }, testInfo) => {
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
    sessionStorage.removeItem('tt_players_my_tt_saved_notice');
  }, { claimedPlayer: player, savedProfile: fullProfile() });

  await page.goto(`${previewUrl}/tabs/home/my-tt`, { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: player.name })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('button', { name: 'Edit profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: /Linked public player/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'More My TT actions' })).toHaveCount(0);
  await expect(page.locator('.tt-my-tt-fact')).toHaveCount(6);
  await expect(page.locator('.tt-my-tt-equipment-group')).toHaveCount(3);
  await expect(page.locator('.tt-my-tt-rubber-line')).toHaveCount(2);
  await expect(page.getByText('FH', { exact: true })).toBeVisible();
  await expect(page.getByText('BH', { exact: true })).toBeVisible();

  const overviewGeometry = await page.evaluate(() => ({
    viewport: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
    factColumns: getComputedStyle(document.querySelector<HTMLElement>('.tt-my-tt-fact-grid')!).gridTemplateColumns,
    overflowMenuCount: document.querySelectorAll('.tt-action-menu').length,
  }));
  expect(overviewGeometry.scrollWidth).toBeLessThanOrEqual(overviewGeometry.viewport + 1);
  expect(overviewGeometry.overflowMenuCount).toBe(0);
  await capture(page, testInfo, 'my-tt-richer-identity', overviewGeometry);

  await page.getByText('Equipment', { exact: true }).scrollIntoViewIfNeeded();
  await expect(page.getByText('Butterfly Harimoto Super ALC')).toBeVisible();
  await expect(page.getByText('Playing table tennis for 30+ years. Love every detail of speed and spin.')).toBeVisible();
  await expect(page.getByText('Saved to your account, separately from indexed public match records.')).toBeVisible();
  await capture(page, testInfo, 'my-tt-grouped-equipment-about', {
    equipmentGroups: await page.locator('.tt-my-tt-equipment-group').count(),
    quoteBlocks: await page.locator('.tt-my-tt-about blockquote').count(),
  });

  await page.getByRole('button', { name: 'Edit profile' }).click();
  await expect(page).toHaveURL(/\/tabs\/home\/my-tt\/edit$/);
  await page.getByRole('button', { name: 'Attacking' }).click();
  await page.getByLabel('Short introduction').fill('Attacking player who loves speed, spin and improving every week.');
  await page.getByRole('button', { name: 'Save changes' }).scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(/\/tabs\/home\/my-tt$/);
  await expect(page.getByRole('status')).toHaveText('Profile updated');
  await expect(page.getByText('Attacking', { exact: true })).toBeVisible();
  await expect(page.getByText('Attacking player who loves speed, spin and improving every week.')).toBeVisible();

  const storage = await page.evaluate(() => ({
    profile: JSON.parse(localStorage.getItem('tt_players_my_tt_profile') ?? 'null') as unknown,
    savedNotice: sessionStorage.getItem('tt_players_my_tt_saved_notice'),
  }));
  expect(storage.profile).toMatchObject({
    playerId: player.id,
    playingStyle: 'attacking',
    bio: 'Attacking player who loves speed, spin and improving every week.',
  });
  expect(storage.savedNotice).toBeNull();
  await capture(page, testInfo, 'my-tt-returned-after-save', storage);
});
