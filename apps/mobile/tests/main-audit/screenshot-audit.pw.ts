import { test } from '@playwright/test';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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

type AuditStatus = 'captured' | 'skipped' | 'error';

interface AuditEntry {
  sequence: number;
  project: string;
  section: 'anonymous' | 'authenticated';
  title: string;
  url: string;
  finalUrl?: string;
  screenshotPath?: string;
  diagnosticsPath: string;
  status: AuditStatus;
  fullPage: boolean;
  eventCount: number;
  reason?: string;
}

interface AuditRoute {
  title: string;
  path: string;
}

interface AuditContext {
  page: Page;
  previewUrl: string;
  project: string;
  events: AuditEvent[];
  sequence: number;
}

type EntityKind = 'player' | 'event' | 'league' | 'team' | 'fixture';

type EntityRoutes = Partial<Record<EntityKind, string>> & {
  playerIds: string[];
};

const reportDir = process.env.UI_REVIEW_REPORT_DIR ?? 'ui-review-report';
const screenshotsDir = join(reportDir, 'screenshots');
const diagnosticsDir = join(reportDir, 'diagnostics');
const manifestPath = join(reportDir, 'manifest.json');
const maxDiscoveredRoutes = readPositiveInt('UI_AUDIT_MAX_DISCOVERED_ROUTES', 36);
const maxInteractionsPerRoute = readPositiveInt('UI_AUDIT_MAX_INTERACTIONS_PER_ROUTE', 4);

const PUBLIC_ROUTES: AuditRoute[] = [
  { title: 'home', path: '/tabs/home' },
  { title: 'players', path: '/tabs/players' },
  { title: 'player-ratings', path: '/tabs/players/ratings' },
  { title: 'leagues', path: '/tabs/leagues' },
  { title: 'tournaments', path: '/tabs/events' },
  { title: 'h2h-picker', path: '/tabs/h2h' },
  { title: 'about', path: '/about' },
  { title: 'data-coverage', path: '/data-coverage' },
  { title: 'design-system', path: '/design-system' },
  { title: 'rating-audit-overview', path: '/rating-audit' },
  { title: 'rating-audit-player', path: '/rating-audit/player' },
  { title: 'rating-audit-data', path: '/rating-audit/data' },
  { title: 'rating-audit-identities', path: '/rating-audit/identities' },
  { title: 'rating-audit-network', path: '/rating-audit/network' },
];

const AUTHENTICATED_ROUTES: AuditRoute[] = [
  { title: 'signed-in-home', path: '/tabs/home' },
  { title: 'my-tt', path: '/tabs/home/my-tt' },
  { title: 'edit-my-tt', path: '/tabs/home/my-tt/edit' },
  { title: 'saved-players', path: '/tabs/players' },
  { title: 'saved-tournaments', path: '/tabs/events' },
];

const UNSAFE_CONTROL_NAME = /delete|remove|sign out|sign in|install|update app|share|download|export|reset|clear all|unlink|disconnect/i;
const IGNORED_PATH_PREFIXES = ['/api/', '/assets/', '/appkit/', '/images/'];
const IGNORED_EXTENSIONS = /\.(?:avif|css|gif|ico|jpe?g|js|json|map|png|svg|txt|webmanifest|woff2?)$/i;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  mkdirSync(screenshotsDir, { recursive: true });
  mkdirSync(diagnosticsDir, { recursive: true });
});

function readPositiveInt(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function requirePreviewUrl(): string {
  const raw = process.env.PREVIEW_URL?.trim();
  if (!raw) throw new Error('PREVIEW_URL is required');
  const parsed = new URL(raw);
  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new Error('PREVIEW_URL must use HTTP or HTTPS');
  }
  return parsed.toString().replace(/\/$/, '');
}

function appUrl(previewUrl: string, path: string): string {
  return new URL(path, `${previewUrl}/`).toString();
}

function slug(value: string): string {
  return value
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || 'screen';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function redact(value: string): string {
  let redacted = value.replace(/([?&](?:token|key|secret|auth|code)=)[^&]+/gi, '$1[redacted]');
  for (const secret of [process.env.UI_AUDIT_PASSWORD, process.env.VITE_SUPABASE_PUBLISHABLE_KEY]) {
    if (secret) redacted = redacted.replaceAll(secret, '[redacted]');
  }
  return redacted.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]');
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
  const entries = readManifest().filter((item) => !(
    item.project === entry.project
    && item.section === entry.section
    && item.title === entry.title
  ));
  entries.push(entry);
  entries.sort((a, b) => a.sequence - b.sequence || a.project.localeCompare(b.project));
  writeFileSync(manifestPath, `${JSON.stringify(entries, null, 2)}\n`);
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

async function prepareAppState(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([]));
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });
}

async function settleForScreenshot(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 5_000 }).catch(() => undefined);
  await page.locator('body').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'hidden', timeout: 8_000 }).catch(() => undefined);
  await page.addStyleTag({
    content: '* { transition: none !important; animation: none !important; caret-color: transparent !important; scroll-behavior: auto !important; }',
  }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
  await page.waitForTimeout(500);
}

function isReviewableUrl(candidate: string, previewUrl: string): boolean {
  try {
    const candidateUrl = new URL(candidate, `${previewUrl}/`);
    const base = new URL(previewUrl);
    return candidateUrl.origin === base.origin
      && ['http:', 'https:'].includes(candidateUrl.protocol)
      && !IGNORED_PATH_PREFIXES.some((prefix) => candidateUrl.pathname.startsWith(prefix))
      && !IGNORED_EXTENSIONS.test(candidateUrl.pathname);
  } catch {
    return false;
  }
}

function normalizeReviewUrl(candidate: string, previewUrl: string): string | null {
  if (!isReviewableUrl(candidate, previewUrl)) return null;
  const url = new URL(candidate, `${previewUrl}/`);
  url.hash = '';
  return url.toString();
}

async function writeCapture(
  context: AuditContext,
  section: AuditEntry['section'],
  title: string,
  requestedUrl: string,
  eventStart: number,
  fullPage: boolean,
): Promise<void> {
  const { page, project } = context;
  context.sequence += 1;
  const prefix = `${String(context.sequence).padStart(3, '0')}-${project}-${section}-${slug(title)}`;
  const screenshotPath = `screenshots/${prefix}.png`;
  const diagnosticsPath = `diagnostics/${prefix}.json`;
  const events = context.events.slice(eventStart);
  let screenshotMode = fullPage;

  mkdirSync(dirname(join(reportDir, screenshotPath)), { recursive: true });
  try {
    await page.screenshot({ path: join(reportDir, screenshotPath), fullPage, timeout: 30_000 });
  } catch (error) {
    screenshotMode = false;
    await page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
    events.push({ type: 'console', level: 'warning', text: `Full-page screenshot fallback: ${redact(errorMessage(error))}` });
  }

  const finalUrl = redact(page.url());
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({
    requestedUrl: redact(requestedUrl),
    finalUrl,
    fullPage: screenshotMode,
    events,
  }, null, 2)}\n`);
  appendManifest({
    sequence: context.sequence,
    project,
    section,
    title,
    url: redact(requestedUrl),
    finalUrl,
    screenshotPath,
    diagnosticsPath,
    status: 'captured',
    fullPage: screenshotMode,
    eventCount: events.length,
  });
}

async function recordProblem(
  context: AuditContext,
  section: AuditEntry['section'],
  title: string,
  requestedUrl: string,
  eventStart: number,
  status: Extract<AuditStatus, 'skipped' | 'error'>,
  reason: string,
): Promise<void> {
  context.sequence += 1;
  const prefix = `${String(context.sequence).padStart(3, '0')}-${context.project}-${section}-${slug(title)}`;
  const diagnosticsPath = `diagnostics/${prefix}.json`;
  const events = context.events.slice(eventStart);
  const screenshotPath = `screenshots/${prefix}.png`;
  let capturedFallback = false;

  try {
    await settleForScreenshot(context.page);
    await context.page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 10_000 });
    capturedFallback = true;
  } catch {
    // The page may be closed or unavailable; diagnostics are still useful.
  }

  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({
    requestedUrl: redact(requestedUrl),
    finalUrl: redact(context.page.url()),
    status,
    reason: redact(reason),
    events,
  }, null, 2)}\n`);
  appendManifest({
    sequence: context.sequence,
    project: context.project,
    section,
    title,
    url: redact(requestedUrl),
    finalUrl: redact(context.page.url()),
    screenshotPath: capturedFallback ? screenshotPath : undefined,
    diagnosticsPath,
    status,
    fullPage: false,
    eventCount: events.length,
    reason: redact(reason),
  });
}

async function captureRoute(
  context: AuditContext,
  section: AuditEntry['section'],
  title: string,
  url: string,
  fullPage = true,
): Promise<boolean> {
  const eventStart = context.events.length;
  try {
    await context.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await settleForScreenshot(context.page);
    await writeCapture(context, section, title, url, eventStart, fullPage);
    return true;
  } catch (error) {
    await recordProblem(context, section, title, url, eventStart, 'error', errorMessage(error));
    return false;
  }
}

async function captureState(
  context: AuditContext,
  section: AuditEntry['section'],
  title: string,
  requestedUrl: string,
  action: () => Promise<void>,
  fullPage = false,
): Promise<boolean> {
  const eventStart = context.events.length;
  try {
    await action();
    await settleForScreenshot(context.page);
    await writeCapture(context, section, title, requestedUrl, eventStart, fullPage);
    return true;
  } catch (error) {
    await recordProblem(context, section, title, requestedUrl, eventStart, 'error', errorMessage(error));
    return false;
  }
}

async function collectPageLinks(page: Page, previewUrl: string): Promise<string[]> {
  const hrefs = await page.locator('a[href]').evaluateAll((links) => links
    .map((link) => link.getAttribute('href'))
    .filter((href): href is string => Boolean(href)))
    .catch(() => [] as string[]);
  return hrefs
    .map((href) => normalizeReviewUrl(href, previewUrl))
    .filter((url): url is string => Boolean(url));
}

async function controlName(control: Locator): Promise<string> {
  const ariaLabel = await control.getAttribute('aria-label').then((label) => label?.trim() ?? '').catch(() => '');
  if (ariaLabel) return ariaLabel;
  const text = await control.innerText().then((value) => value.trim()).catch(() => '');
  if (text) return text;
  return control.getAttribute('value').then((value) => value?.trim() ?? '').catch(() => '');
}

async function captureInteractiveStates(
  context: AuditContext,
  section: AuditEntry['section'],
  route: AuditRoute,
): Promise<void> {
  const url = appUrl(context.previewUrl, route.path);
  let captures = 0;

  const search = context.page.locator('input[type="search"], input[role="searchbox"]').first();
  if (captures < maxInteractionsPerRoute && await search.isVisible().catch(() => false)) {
    const captured = await captureState(context, section, `${route.title}-search-results`, url, async () => {
      await search.fill('Smith');
      await context.page.waitForTimeout(900);
    }, false);
    if (captured) captures += 1;
    await context.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await settleForScreenshot(context.page);
  }

  const selectors = ['[role="tab"]', 'input[type="radio"]', 'button[aria-expanded]'];
  for (const selector of selectors) {
    const controls = context.page.locator(selector);
    const count = Math.min(await controls.count().catch(() => 0), 8);
    for (let index = 0; index < count && captures < maxInteractionsPerRoute; index += 1) {
      const control = controls.nth(index);
      if (!await control.isVisible().catch(() => false) || await control.isDisabled().catch(() => true)) continue;
      const name = await controlName(control);
      if (!name || UNSAFE_CONTROL_NAME.test(name)) continue;
      const selected = await control.getAttribute('aria-selected') === 'true'
        || await control.getAttribute('aria-checked') === 'true'
        || await control.isChecked().catch(() => false);
      if (selected && selector !== 'button[aria-expanded]') continue;

      const captured = await captureState(
        context,
        section,
        `${route.title}-${slug(name)}-state`,
        url,
        async () => {
          if (selector === 'input[type="radio"]') {
            const id = await control.getAttribute('id');
            const label = id ? context.page.locator(`label[for="${id}"]`) : null;
            if (label && await label.isVisible().catch(() => false)) await label.click();
            else await control.click({ force: true });
          } else {
            await control.click();
          }
          await context.page.waitForTimeout(500);
        },
        false,
      );
      if (captured) captures += 1;
      await context.page.keyboard.press('Escape').catch(() => undefined);
      await context.page.goto(url, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
      await settleForScreenshot(context.page);
    }
  }
}

async function captureDrawer(
  context: AuditContext,
  section: AuditEntry['section'],
  title: string,
): Promise<void> {
  const url = appUrl(context.previewUrl, '/tabs/home');
  await context.page.goto(url, { waitUntil: 'domcontentloaded' });
  await settleForScreenshot(context.page);
  const openButton = context.page.getByRole('button', { name: /open menu/i }).first();
  if (!await openButton.isVisible().catch(() => false)) {
    await recordProblem(context, section, title, url, context.events.length, 'skipped', 'The main menu button was not rendered.');
    return;
  }
  await captureState(context, section, title, url, async () => {
    await openButton.click();
    await context.page.locator('aside[role="dialog"]').waitFor({ state: 'visible', timeout: 10_000 });
  }, false);
  await context.page.keyboard.press('Escape').catch(() => undefined);
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

async function discoverListDestinations(
  context: AuditContext,
  rootPath: string,
  maxItems: number,
  beforeScan?: () => Promise<void>,
): Promise<string[]> {
  const discovered: string[] = [];
  const rootUrl = appUrl(context.previewUrl, rootPath);

  for (let index = 0; index < maxItems; index += 1) {
    await context.page.goto(rootUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await settleForScreenshot(context.page);
    if (beforeScan) await beforeScan().catch(() => undefined);
    const items = context.page.locator('.tt-list-item__clickable');
    const visible = await items.first().waitFor({ state: 'visible', timeout: 15_000 })
      .then(() => true)
      .catch(() => false);
    const count = await items.count().catch(() => 0);
    if (!visible || index >= count) break;

    const before = context.page.url();
    await items.nth(index).click().catch(() => undefined);
    const changed = await context.page.waitForURL((url) => url.toString() !== before, { timeout: 8_000 })
      .then(() => true)
      .catch(() => false);
    if (!changed) continue;
    const normalized = normalizeReviewUrl(context.page.url(), context.previewUrl);
    if (normalized && !discovered.includes(normalized)) discovered.push(normalized);
  }

  return discovered;
}

async function discoverEntityRoutes(context: AuditContext): Promise<{ entities: EntityRoutes; urls: string[] }> {
  const urls = new Set<string>();
  const entities: EntityRoutes = { playerIds: [] };

  for (const url of await discoverListDestinations(context, '/tabs/players', 8)) urls.add(url);
  for (const url of await discoverListDestinations(context, '/tabs/events', 8)) urls.add(url);
  for (const url of await discoverListDestinations(context, '/tabs/leagues', 16)) urls.add(url);
  for (const url of await discoverListDestinations(context, '/tabs/leagues', 10, async () => {
    const teams = context.page.getByRole('radio', { name: /teams/i }).first();
    if (await teams.isVisible().catch(() => false)) await teams.click();
    await context.page.waitForTimeout(400);
  })) urls.add(url);

  for (const url of urls) {
    const parsed = new URL(url);
    const kind = classifyEntityPath(parsed.pathname);
    if (!kind) continue;
    if (!entities[kind]) entities[kind] = url;
    if (kind === 'player') {
      const id = playerIdFromPath(parsed.pathname);
      if (id && !entities.playerIds.includes(id)) entities.playerIds.push(id);
    }
  }

  return { entities, urls: [...urls] };
}

function derivedEntityRoutes(previewUrl: string, entities: EntityRoutes): AuditRoute[] {
  const routes: AuditRoute[] = [];
  const playerId = entities.playerIds[0];
  if (playerId) {
    routes.push(
      { title: 'player-detail', path: `/tabs/players/player/${playerId}` },
      { title: 'player-insights', path: `/tabs/players/player/${playerId}/insights` },
      { title: 'player-matches', path: `/tabs/players/player/${playerId}/matches` },
      { title: 'player-tournaments', path: `/tabs/players/player/${playerId}/tournaments` },
      { title: 'player-journal', path: `/tabs/players/player/${playerId}/journal` },
    );
  }

  const [playerA, playerB] = entities.playerIds;
  if (playerA && playerB) {
    routes.push(
      { title: 'h2h-detail', path: `/h2h/${playerA}/${playerB}` },
      { title: 'h2h-common-opponents', path: `/h2h/${playerA}/${playerB}/common-opponents` },
    );
  }

  for (const [kind, title] of [
    ['event', 'tournament-detail'],
    ['league', 'league-detail'],
    ['team', 'team-detail'],
    ['fixture', 'fixture-detail'],
  ] as const) {
    const url = entities[kind];
    if (url) routes.push({ title, path: new URL(url, previewUrl).pathname });
  }

  return routes;
}

async function recordMissingEntityRoutes(context: AuditContext, entities: EntityRoutes): Promise<void> {
  const checks: Array<[string, boolean, string]> = [
    ['player-detail', Boolean(entities.player), 'No representative player was available in production data.'],
    ['tournament-detail', Boolean(entities.event), 'No representative tournament was available in production data.'],
    ['league-detail', Boolean(entities.league), 'No representative league was available in production data.'],
    ['team-detail', Boolean(entities.team), 'No representative team was available in production data.'],
    ['fixture-detail', Boolean(entities.fixture), 'No representative fixture was available in production data.'],
    ['h2h-detail', entities.playerIds.length >= 2, 'Two representative players were not available in production data.'],
  ];
  for (const [title, available, reason] of checks) {
    if (!available) {
      await recordProblem(context, 'anonymous', title, context.previewUrl, context.events.length, 'skipped', reason);
    }
  }
}

async function captureAuthenticatedStates(context: AuditContext): Promise<void> {
  const credentials = {
    supabaseUrl: process.env.VITE_SUPABASE_URL?.trim() ?? '',
    publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
    email: process.env.UI_AUDIT_EMAIL?.trim() ?? '',
    password: process.env.UI_AUDIT_PASSWORD?.trim() ?? '',
  };
  if (Object.values(credentials).some((value) => !value)) {
    await recordProblem(
      context,
      'authenticated',
      'authenticated-pages',
      appUrl(context.previewUrl, '/tabs/home'),
      context.events.length,
      'skipped',
      'Synthetic-user credentials are not configured.',
    );
    return;
  }

  const homeUrl = appUrl(context.previewUrl, '/tabs/home');
  const eventStart = context.events.length;
  try {
    await context.page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
    await signInSyntheticUser(context.page, credentials);
    await context.page.reload({ waitUntil: 'domcontentloaded' });
    await settleForScreenshot(context.page);
  } catch (error) {
    await recordProblem(context, 'authenticated', 'synthetic-user-sign-in', homeUrl, eventStart, 'error', errorMessage(error));
    return;
  }

  for (const route of AUTHENTICATED_ROUTES) {
    const url = appUrl(context.previewUrl, route.path);
    await captureRoute(context, 'authenticated', route.title, url, true);
    await captureInteractiveStates(context, 'authenticated', route);
  }
  await captureDrawer(context, 'authenticated', 'signed-in-drawer');

  for (const [title, name] of [
    ['saved-players-only', /show saved players only/i],
    ['saved-tournaments-only', /show saved tournaments only/i],
  ] as const) {
    const routePath = title.includes('players') ? '/tabs/players' : '/tabs/events';
    const url = appUrl(context.previewUrl, routePath);
    await context.page.goto(url, { waitUntil: 'domcontentloaded' });
    await settleForScreenshot(context.page);
    const button = context.page.getByRole('button', { name }).first();
    if (!await button.isVisible().catch(() => false)) {
      await recordProblem(context, 'authenticated', title, url, context.events.length, 'skipped', 'The saved-items filter was not rendered.');
      continue;
    }
    await captureState(context, 'authenticated', title, url, async () => button.click(), false);
  }
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
    const key = `${entry.project} · ${entry.section}`;
    acc[key] = acc[key] ?? [];
    acc[key].push(entry);
    return acc;
  }, {});
  const counts = entries.reduce<Record<AuditStatus, number>>((acc, entry) => {
    acc[entry.status] += 1;
    return acc;
  }, { captured: 0, skipped: 0, error: 0 });

  const sections = Object.entries(groups).map(([group, items]) => `
    <section>
      <h2>${escapeHtml(group)}</h2>
      <div class="grid">
        ${items.map((item) => `
          <article class="${escapeHtml(item.status)}">
            <div class="card-heading"><h3>${escapeHtml(item.title)}</h3><span class="badge">${escapeHtml(item.status)}</span></div>
            ${item.screenshotPath ? `<a href="${escapeHtml(item.screenshotPath)}"><img src="${escapeHtml(item.screenshotPath)}" alt="${escapeHtml(`${group} ${item.title}`)}" loading="lazy" /></a>` : ''}
            <p><a href="${escapeHtml(item.finalUrl ?? item.url)}">${escapeHtml(new URL(item.finalUrl ?? item.url).pathname)}</a></p>
            <p>${item.fullPage ? 'Full page' : 'Viewport'} · ${item.eventCount} diagnostic event(s)</p>
            ${item.reason ? `<p class="reason">${escapeHtml(item.reason)}</p>` : ''}
            <p><a href="${escapeHtml(item.diagnosticsPath)}">Diagnostics</a></p>
          </article>
        `).join('')}
      </div>
    </section>
  `).join('');

  writeFileSync(join(reportDir, 'index.html'), `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width, initial-scale=1" />
<title>TT Players Main UI Audit</title><style>
body{margin:0;font-family:system-ui,sans-serif;background:#f7f8f7;color:#17211d}main{max-width:1440px;margin:0 auto;padding:24px}h1,h2,h3{margin:0 0 12px}header,section{margin-bottom:28px}.summary{display:flex;flex-wrap:wrap;gap:10px;margin:16px 0}.summary span,.badge{border:1px solid #cfd8d2;border-radius:999px;padding:4px 9px;background:#fff}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}article{background:white;border:1px solid #d9dfda;border-radius:10px;padding:12px}article.skipped{border-style:dashed}article.error{border-color:#b66}.card-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}img{width:100%;height:420px;object-fit:contain;object-position:top;border:1px solid #d9dfda;border-radius:6px;display:block;background:#f4f6f4}a{color:#0f6655}.reason{color:#7a2f2f}code{background:#eef2ef;padding:2px 5px;border-radius:4px}
</style></head><body><main><header><h1>TT Players Main UI Audit</h1><p>Screenshot collection only; diagnostic events are recorded but do not fail the run.</p><p>Deployment: <a href="${escapeHtml(previewUrl)}">${escapeHtml(previewUrl)}</a></p><p>Commit: <code>${escapeHtml(process.env.GITHUB_SHA ?? 'local')}</code></p><div class="summary"><span>${counts.captured} captured</span><span>${counts.skipped} skipped</span><span>${counts.error} capture errors</span></div></header>${sections}</main></body></html>\n`);
}

test('collects page and interaction screenshots for UI/UX audit', async ({ page }, testInfo: TestInfo) => {
  const previewUrl = requirePreviewUrl();
  await prepareAppState(page);
  const context: AuditContext = {
    page,
    previewUrl,
    project: testInfo.project.name,
    events: installDiagnostics(page),
    sequence: readManifest().reduce((max, item) => Math.max(max, item.sequence), 0),
  };

  const discoveredLinks = new Set<string>();
  try {
    for (const route of PUBLIC_ROUTES) {
      const url = appUrl(previewUrl, route.path);
      const captured = await captureRoute(context, 'anonymous', route.title, url, true);
      if (captured) {
        for (const discovered of await collectPageLinks(page, previewUrl)) discoveredLinks.add(discovered);
        await captureInteractiveStates(context, 'anonymous', route);
      }
    }

    await captureDrawer(context, 'anonymous', 'main-drawer');

    const { entities, urls } = await discoverEntityRoutes(context);
    for (const url of urls) discoveredLinks.add(url);
    const entityRoutes = derivedEntityRoutes(previewUrl, entities);
    for (const route of entityRoutes) {
      const url = appUrl(previewUrl, route.path);
      const captured = await captureRoute(context, 'anonymous', route.title, url, true);
      if (captured) {
        for (const discovered of await collectPageLinks(page, previewUrl)) discoveredLinks.add(discovered);
        await captureInteractiveStates(context, 'anonymous', route);
      }
    }
    await recordMissingEntityRoutes(context, entities);

    const alreadyCaptured = new Set([...PUBLIC_ROUTES, ...entityRoutes].map((route) => new URL(appUrl(previewUrl, route.path)).pathname));
    let extraIndex = 0;
    for (const discoveredUrl of discoveredLinks) {
      const pathname = new URL(discoveredUrl).pathname;
      if (alreadyCaptured.has(pathname) || extraIndex >= maxDiscoveredRoutes) continue;
      alreadyCaptured.add(pathname);
      extraIndex += 1;
      await captureRoute(context, 'anonymous', `discovered-${slug(pathname)}`, discoveredUrl, true);
    }

    await captureAuthenticatedStates(context);
  } catch (error) {
    await recordProblem(context, 'anonymous', 'audit-run', previewUrl, context.events.length, 'error', errorMessage(error));
  } finally {
    writeReportIndex(previewUrl);
  }
});
