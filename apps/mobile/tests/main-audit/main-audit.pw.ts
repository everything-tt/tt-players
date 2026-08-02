import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { signInSyntheticUser } from './supabase-audit-auth';

interface AuditEvent {
  type: 'pageerror' | 'console' | 'requestfailed' | 'response';
  message?: string;
  level?: string;
  text?: string;
  url?: string;
  status?: number;
  failure?: string;
}

interface AuditEntry {
  project: string;
  title: string;
  url: string;
  path?: string;
  diagnosticsPath: string;
  status: 'captured' | 'skipped';
  reason?: string;
}

interface AuditFailure {
  project: string;
  title: string;
  url: string;
  events: AuditEvent[];
}

interface DiscoveredScreens {
  playerIds: string[];
  player?: string;
  event?: string;
  league?: string;
  team?: string;
  fixture?: string;
  h2h?: string;
}

type EntityKind = 'player' | 'event' | 'league' | 'team' | 'fixture';

const reportDir = process.env.UI_REVIEW_REPORT_DIR ?? 'ui-review-report';
const screenshotsDir = join(reportDir, 'screenshots');
const diagnosticsDir = join(reportDir, 'diagnostics');
const manifestPath = join(reportDir, 'manifest.json');
const anonymousScreens: DiscoveredScreens = { playerIds: [] };
const auditFailures: AuditFailure[] = [];

const ROOT_SCREENS = [
  { title: 'home', path: '/tabs/home' },
  { title: 'players', path: '/tabs/players' },
  { title: 'leagues', path: '/tabs/leagues' },
  { title: 'tournaments', path: '/tabs/events' },
  { title: 'h2h-picker', path: '/tabs/h2h' },
  { title: 'ratings', path: '/tabs/players/ratings' },
  { title: 'about', path: '/about' },
  { title: 'data-coverage', path: '/data-coverage' },
  { title: 'design-system', path: '/design-system' },
] as const;

const PLAYER_SUBPAGES = [
  { title: 'player-insights', suffix: 'insights' },
  { title: 'player-matches', suffix: 'matches' },
  { title: 'player-tournaments', suffix: 'tournaments' },
  { title: 'player-journal', suffix: 'journal' },
] as const;

const ENTITY_TITLES: Record<EntityKind, string> = {
  player: 'player-detail',
  event: 'tournament-detail',
  league: 'league-detail',
  team: 'team-detail',
  fixture: 'fixture-detail',
};

function requirePreviewUrl(): string {
  const raw = process.env.PREVIEW_URL?.trim();
  if (!raw) throw new Error('PREVIEW_URL is required');
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('PREVIEW_URL must use http or https');
  }
  return parsed.toString().replace(/\/$/, '');
}

function appUrl(previewUrl: string, path: string): string {
  return new URL(path, `${previewUrl}/`).toString();
}

async function prepareAppState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });
}

function redact(value: string): string {
  let redacted = value.replace(/([?&](?:token|key|secret|auth|code)=)[^&]+/gi, '$1[redacted]');
  for (const secret of [
    process.env.UI_AUDIT_PASSWORD,
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY,
  ]) {
    if (secret) redacted = redacted.replaceAll(secret, '[redacted]');
  }
  return redacted.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]');
}

function installDiagnostics(page: Page): AuditEvent[] {
  const events: AuditEvent[] = [];
  page.on('pageerror', (error) => events.push({ type: 'pageerror', message: redact(error.message) }));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) {
      events.push({ type: 'console', level: message.type(), text: redact(message.text()) });
    }
  });
  page.on('requestfailed', (request) => {
    events.push({
      type: 'requestfailed',
      url: redact(request.url()),
      failure: redact(request.failure()?.errorText ?? 'unknown'),
    });
  });
  page.on('response', (response) => {
    if (response.status() >= 500) {
      events.push({ type: 'response', url: redact(response.url()), status: response.status() });
    }
  });
  return events;
}

function readManifest(): AuditEntry[] {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    return Array.isArray(parsed) ? parsed as AuditEntry[] : [];
  } catch {
    return [];
  }
}

function appendManifest(entry: AuditEntry): void {
  const entries = readManifest().filter((item) =>
    !(item.project === entry.project && item.title === entry.title));
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

function writeReportIndex(previewUrl: string): void {
  const entries = readManifest();
  const groups = entries.reduce<Record<string, AuditEntry[]>>((acc, entry) => {
    acc[entry.project] = acc[entry.project] ?? [];
    acc[entry.project].push(entry);
    return acc;
  }, {});

  const sections = Object.entries(groups).map(([project, items]) => `
    <section>
      <h2>${escapeHtml(project)}</h2>
      <div class="grid">
        ${items.map((item) => item.status === 'captured' && item.path ? `
          <article>
            <h3>${escapeHtml(item.title)}</h3>
            <a href="${escapeHtml(item.path)}"><img src="${escapeHtml(item.path)}" alt="${escapeHtml(`${project} ${item.title}`)}" /></a>
            <p><a href="${escapeHtml(item.url)}">${escapeHtml(new URL(item.url).pathname)}</a></p>
            <p><a href="${escapeHtml(item.diagnosticsPath)}">Diagnostics</a></p>
          </article>
        ` : `
          <article class="skipped">
            <h3>${escapeHtml(item.title)}</h3>
            <p><strong>Skipped</strong></p>
            <p>${escapeHtml(item.reason ?? 'Representative production data was unavailable.')}</p>
            <p><a href="${escapeHtml(item.diagnosticsPath)}">Diagnostics</a></p>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');

  writeFileSync(join(reportDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT Players Main UI Audit</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1180px;margin:0 auto;padding:24px}
h1,h2,h3{margin:0 0 12px}header,section{margin-bottom:28px}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:16px}
article{background:white;border:1px solid #d9dfda;border-radius:8px;padding:12px}article.skipped{border-style:dashed}img{width:100%;height:auto;border:1px solid #d9dfda;border-radius:6px;display:block}a{color:#0f6655}code{background:#eef2ef;padding:2px 5px;border-radius:4px}
</style></head><body><main><header><h1>TT Players Main UI Audit</h1><p>Deployment: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><p>Commit: <code>${escapeHtml(process.env.GITHUB_SHA ?? 'local')}</code></p></header>${sections}</main></body></html>\n`);
}

async function settleForScreenshot(page: Page): Promise<void> {
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; }' });
  await page.evaluate(() => document.fonts.ready);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(250);
}

async function waitForRenderedPage(page: Page): Promise<void> {
  await expect(page.locator('body')).toBeVisible();
  await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);
  await expect(page.locator('body')).not.toContainText(/application error|unauthori[sz]ed|page not found/i);
}

function severeEvents(events: AuditEvent[]): AuditEvent[] {
  return events.filter((event) => event.type === 'pageerror' || event.type === 'response');
}

function summarizeAuditEvent(event: AuditEvent): string {
  if (event.type === 'response') return `${event.status ?? '5xx'} ${event.url ?? 'unknown URL'}`;
  return event.message ?? event.text ?? event.failure ?? event.url ?? event.type;
}

function assertNoAuditFailures(): void {
  if (auditFailures.length === 0) return;
  const details = auditFailures.map((failure) => {
    const events = failure.events.map((event) => `    - ${summarizeAuditEvent(event)}`).join('\n');
    return `  - ${failure.project}/${failure.title}: ${failure.url}\n${events}`;
  }).join('\n');
  throw new Error(`Main UI audit captured ${auditFailures.length} screen(s) with severe browser events:\n${details}`);
}

async function captureCurrent(
  page: Page,
  project: string,
  title: string,
  events: AuditEvent[],
): Promise<void> {
  await waitForRenderedPage(page);
  await settleForScreenshot(page);
  const safeTitle = title.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const screenshotPath = `screenshots/${project}-${safeTitle}.png`;
  const diagnosticsPath = `diagnostics/${project}-${safeTitle}.json`;
  await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({
    route: redact(page.url()),
    finalUrl: redact(page.url()),
    events,
  }, null, 2)}\n`);
  appendManifest({
    project,
    title,
    url: page.url(),
    path: screenshotPath,
    diagnosticsPath,
    status: 'captured',
  });
  const severe = severeEvents(events);
  if (severe.length > 0) {
    auditFailures.push({
      project,
      title,
      url: redact(page.url()),
      events: severe.map((event) => ({ ...event })),
    });
  }
}

async function visitAndCapture(
  page: Page,
  previewUrl: string,
  project: string,
  title: string,
  path: string,
  events: AuditEvent[],
): Promise<void> {
  events.length = 0;
  await page.goto(appUrl(previewUrl, path), { waitUntil: 'domcontentloaded' });
  await captureCurrent(page, project, title, events);
}

function recordSkipped(project: string, title: string, url: string, reason: string): void {
  const safeTitle = title.replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const diagnosticsPath = `diagnostics/${project}-${safeTitle}.json`;
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({ route: url, status: 'skipped', reason }, null, 2)}\n`);
  appendManifest({ project, title, url, diagnosticsPath, status: 'skipped', reason });
}

function classifyEntityPath(pathname: string): EntityKind | null {
  if (/\/player\/[^/]+$/.test(pathname) || /^\/players\/[^/]+$/.test(pathname)) return 'player';
  if (/\/event\/[^/]+$/.test(pathname) || /^\/tournaments\/[^/]+$/.test(pathname)) return 'event';
  if (/\/league\/[^/]+$/.test(pathname)) return 'league';
  if (/\/team\/[^/]+$/.test(pathname) || /^\/teams\/[^/]+$/.test(pathname)) return 'team';
  if (/\/fixture\/[^/]+$/.test(pathname)) return 'fixture';
  return null;
}

function playerIdFromPath(pathname: string): string | null {
  return pathname.match(/\/player\/([^/]+)$/)?.[1]
    ?? pathname.match(/^\/players\/([^/]+)$/)?.[1]
    ?? null;
}

async function scanClickableEntities(
  page: Page,
  previewUrl: string,
  project: string,
  rootPath: string,
  wanted: Set<EntityKind>,
  discovered: DiscoveredScreens,
  events: AuditEvent[],
  maxCandidates: number,
): Promise<void> {
  for (let index = 0; index < maxCandidates && wanted.size > 0; index += 1) {
    events.length = 0;
    await page.goto(appUrl(previewUrl, rootPath), { waitUntil: 'domcontentloaded' });
    await waitForRenderedPage(page);
    const items = page.locator('.tt-list-item__clickable');
    const firstVisible = await items.first().isVisible().catch(() => false)
      || await items.first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true).catch(() => false);
    if (!firstVisible) return;
    const count = await items.count();
    if (index >= count) return;

    const before = page.url();
    await items.nth(index).click();
    const changed = await page.waitForURL((url) => url.toString() !== before, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!changed) continue;

    const pathname = new URL(page.url()).pathname;
    const kind = classifyEntityPath(pathname);
    if (!kind) continue;

    if (kind === 'player') {
      const id = playerIdFromPath(pathname);
      if (id && !discovered.playerIds.includes(id)) discovered.playerIds.push(id);
    }

    if (wanted.has(kind)) {
      await captureCurrent(page, project, ENTITY_TITLES[kind], events);
      discovered[kind] = page.url();
      wanted.delete(kind);
    }
  }
}

async function discoverTeam(
  page: Page,
  previewUrl: string,
  project: string,
  discovered: DiscoveredScreens,
  events: AuditEvent[],
): Promise<void> {
  events.length = 0;
  await page.goto(appUrl(previewUrl, '/tabs/leagues'), { waitUntil: 'domcontentloaded' });
  await waitForRenderedPage(page);
  const teamsToggle = page.getByRole('radio', { name: 'Teams' });
  if (await teamsToggle.isVisible().catch(() => false)) {
    await teamsToggle.click();
  }
  const items = page.locator('.tt-list-item__clickable');
  const count = await items.count();
  for (let index = 0; index < Math.min(count, 8); index += 1) {
    if (index > 0) {
      await page.goto(appUrl(previewUrl, '/tabs/leagues'), { waitUntil: 'domcontentloaded' });
      await waitForRenderedPage(page);
      const toggle = page.getByRole('radio', { name: 'Teams' });
      if (await toggle.isVisible().catch(() => false)) await toggle.click();
    }
    const before = page.url();
    await page.locator('.tt-list-item__clickable').nth(index).click();
    const changed = await page.waitForURL((url) => url.toString() !== before, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!changed) continue;
    if (classifyEntityPath(new URL(page.url()).pathname) === 'team') {
      await captureCurrent(page, project, ENTITY_TITLES.team, events);
      discovered.team = page.url();
      return;
    }
  }
}

async function ensureTwoPlayerIds(
  page: Page,
  previewUrl: string,
  project: string,
  discovered: DiscoveredScreens,
  events: AuditEvent[],
): Promise<void> {
  for (let index = 0; index < 6 && discovered.playerIds.length < 2; index += 1) {
    events.length = 0;
    await page.goto(appUrl(previewUrl, '/tabs/players'), { waitUntil: 'domcontentloaded' });
    await waitForRenderedPage(page);
    const items = page.locator('.tt-list-item__clickable');
    const visible = await items.first().waitFor({ state: 'visible', timeout: 20_000 })
      .then(() => true)
      .catch(() => false);
    if (!visible || index >= await items.count()) return;
    const before = page.url();
    await items.nth(index).click();
    const changed = await page.waitForURL((url) => url.toString() !== before, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!changed) continue;
    const id = playerIdFromPath(new URL(page.url()).pathname);
    if (id && !discovered.playerIds.includes(id)) discovered.playerIds.push(id);
  }
}

async function captureAnonymousEntityScreens(
  page: Page,
  previewUrl: string,
  events: AuditEvent[],
): Promise<void> {
  await scanClickableEntities(
    page,
    previewUrl,
    'anonymous',
    '/tabs/players',
    new Set<EntityKind>(['player']),
    anonymousScreens,
    events,
    6,
  );
  await ensureTwoPlayerIds(page, previewUrl, 'anonymous', anonymousScreens, events);

  const playerId = anonymousScreens.playerIds[0];
  if (playerId) {
    for (const subpage of PLAYER_SUBPAGES) {
      await visitAndCapture(
        page,
        previewUrl,
        'anonymous',
        subpage.title,
        `/tabs/players/player/${playerId}/${subpage.suffix}`,
        events,
      );
    }
  } else {
    for (const subpage of PLAYER_SUBPAGES) {
      recordSkipped('anonymous', subpage.title, appUrl(previewUrl, '/tabs/players'), 'No representative player was available.');
    }
  }

  await scanClickableEntities(
    page,
    previewUrl,
    'anonymous',
    '/tabs/events',
    new Set<EntityKind>(['event']),
    anonymousScreens,
    events,
    6,
  );
  await scanClickableEntities(
    page,
    previewUrl,
    'anonymous',
    '/tabs/leagues',
    new Set<EntityKind>(['league', 'fixture']),
    anonymousScreens,
    events,
    18,
  );
  await discoverTeam(page, previewUrl, 'anonymous', anonymousScreens, events);

  const [playerAId, playerBId] = anonymousScreens.playerIds;
  if (playerAId && playerBId) {
    const h2hPath = `/h2h/${playerAId}/${playerBId}`;
    await visitAndCapture(page, previewUrl, 'anonymous', 'h2h-detail', h2hPath, events);
    anonymousScreens.h2h = appUrl(previewUrl, h2hPath);
  } else {
    recordSkipped('anonymous', 'h2h-detail', appUrl(previewUrl, '/tabs/h2h'), 'Two representative players were not available.');
  }

  for (const kind of ['event', 'league', 'team', 'fixture'] as const) {
    if (!anonymousScreens[kind]) {
      recordSkipped(
        'anonymous',
        ENTITY_TITLES[kind],
        appUrl(previewUrl, kind === 'event' ? '/tabs/events' : '/tabs/leagues'),
        `No representative ${kind} was available in deployed production data.`,
      );
    }
  }
}

async function captureSavedFilter(
  page: Page,
  project: string,
  title: string,
  accessibleName: RegExp,
  events: AuditEvent[],
): Promise<void> {
  const toggle = page.getByRole('button', { name: accessibleName });
  if (!await toggle.isVisible().catch(() => false)) {
    recordSkipped(project, title, page.url(), 'The saved filter was not rendered.');
    return;
  }
  events.length = 0;
  await toggle.click();
  await captureCurrent(page, project, title, events);
}

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

test('captures representative anonymous production screens', async ({ page }) => {
  auditFailures.length = 0;
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);
  const events = installDiagnostics(page);

  try {
    for (const screen of ROOT_SCREENS) {
      await visitAndCapture(page, previewUrl, 'anonymous', screen.title, screen.path, events);
    }
    await captureAnonymousEntityScreens(page, previewUrl, events);
  } finally {
    writeReportIndex(previewUrl);
  }

  assertNoAuditFailures();
});

test('captures authenticated production screens with a synthetic user', async ({ page }) => {
  const previewUrl = requirePreviewUrl();
  const email = process.env.UI_AUDIT_EMAIL?.trim();
  const password = process.env.UI_AUDIT_PASSWORD?.trim();
  test.skip(!email || !password, 'UI_AUDIT_EMAIL and UI_AUDIT_PASSWORD are not configured');

  auditFailures.length = 0;
  await prepareAppState(page);
  const events = installDiagnostics(page);

  try {
    await page.goto(appUrl(previewUrl, '/tabs/home'), { waitUntil: 'domcontentloaded' });
    await signInSyntheticUser(page, {
      supabaseUrl: process.env.VITE_SUPABASE_URL ?? '',
      publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? '',
      email: email!,
      password: password!,
    });
    await page.reload({ waitUntil: 'domcontentloaded' });
    await waitForRenderedPage(page);

    await page.getByRole('button', { name: 'Open menu' }).click();
    await expect(page.getByLabel('Signed in')).toBeVisible();
    await expect(page.getByText(email!, { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /sign out/i })).toBeVisible();
    await captureCurrent(page, 'authenticated', 'signed-in-drawer', events);
    await page.getByRole('button', { name: 'Close menu' }).first().click();

    for (const screen of ROOT_SCREENS.filter((item) =>
      ['/tabs/home', '/tabs/players', '/tabs/leagues', '/tabs/events', '/tabs/h2h'].includes(item.path))) {
      await visitAndCapture(page, previewUrl, 'authenticated', screen.title, screen.path, events);
    }

    await page.goto(appUrl(previewUrl, '/tabs/players'), { waitUntil: 'domcontentloaded' });
    await waitForRenderedPage(page);
    await captureSavedFilter(page, 'authenticated', 'saved-players', /show saved players only/i, events);

    await page.goto(appUrl(previewUrl, '/tabs/events'), { waitUntil: 'domcontentloaded' });
    await waitForRenderedPage(page);
    await captureSavedFilter(page, 'authenticated', 'saved-tournaments', /show saved tournaments only/i, events);

    let playerId = anonymousScreens.playerIds[0];
    if (!playerId) {
      const authenticatedScreens: DiscoveredScreens = { playerIds: [] };
      await ensureTwoPlayerIds(page, previewUrl, 'authenticated', authenticatedScreens, events);
      playerId = authenticatedScreens.playerIds[0];
    }
    if (playerId) {
      await visitAndCapture(
        page,
        previewUrl,
        'authenticated',
        'player-journal',
        `/tabs/players/player/${playerId}/journal`,
        events,
      );
    } else {
      recordSkipped('authenticated', 'player-journal', appUrl(previewUrl, '/tabs/players'), 'No representative player was available.');
    }
  } finally {
    writeReportIndex(previewUrl);
  }

  assertNoAuditFailures();
});
