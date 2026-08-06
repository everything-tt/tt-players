import { test } from '@playwright/test';
import type { Locator, Page, Response, TestInfo } from '@playwright/test';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { signInSyntheticUser } from './supabase-audit-auth';

type Section = 'anonymous' | 'authenticated';
type Status = 'captured' | 'skipped' | 'error';
type Kind = 'page' | 'state';

interface Entry {
  sequence: number;
  project: string;
  section: Section;
  kind: Kind;
  title: string;
  routePattern: string;
  requestedUrl: string;
  finalUrl: string;
  screenshotPath?: string;
  diagnosticsPath: string;
  status: Status;
  fullPage: boolean;
  eventCount: number;
  reason?: string;
}

interface AuditEvent {
  type: 'pageerror' | 'console' | 'requestfailed' | 'response';
  message?: string;
  url?: string;
  status?: number;
}

interface RouteSpec {
  title: string;
  path: string;
  pattern?: string;
  states?: boolean;
}

interface Catalog {
  playerIds: string[];
  eventIds: string[];
  leagueIds: string[];
  teamIds: string[];
  fixtureIds: string[];
}

interface Context {
  page: Page;
  project: string;
  baseUrl: string;
  events: AuditEvent[];
  catalog: Catalog;
  pending: Promise<void>[];
  sequence: number;
}

const reportDir = process.env.UI_REVIEW_REPORT_DIR ?? 'ui-review-report';
const screenshotDir = join(reportDir, 'screenshots');
const diagnosticDir = join(reportDir, 'diagnostics');
const manifestPath = join(reportDir, 'manifest.json');
const maxStates = positiveInt('UI_AUDIT_MAX_INTERACTIONS_PER_PAGE', 6);

const PUBLIC_ROUTES: RouteSpec[] = [
  { title: 'root', path: '/', pattern: '/' },
  { title: 'home', path: '/tabs/home' },
  { title: 'players', path: '/tabs/players' },
  { title: 'player-ratings', path: '/tabs/players/ratings', states: true },
  { title: 'leagues', path: '/tabs/leagues' },
  { title: 'tournaments', path: '/tabs/events' },
  { title: 'h2h-picker', path: '/tabs/h2h' },
  { title: 'about', path: '/about' },
  { title: 'data-coverage', path: '/data-coverage' },
  { title: 'design-system', path: '/design-system', states: true },
  { title: 'rating-audit-overview', path: '/rating-audit', states: true },
  { title: 'rating-audit-player', path: '/rating-audit/player' },
  { title: 'rating-audit-coverage', path: '/rating-audit/coverage', states: true },
  { title: 'rating-audit-sources', path: '/rating-audit/sources', states: true },
  { title: 'rating-audit-ranking', path: '/rating-audit/ranking', states: true },
  { title: 'rating-audit-data', path: '/rating-audit/data', states: true },
  { title: 'rating-audit-identities', path: '/rating-audit/identities', states: true },
  { title: 'rating-audit-network', path: '/rating-audit/network', states: true },
];

const AUTH_ROUTES: RouteSpec[] = [
  { title: 'signed-in-home', path: '/tabs/home' },
  { title: 'my-tt', path: '/tabs/home/my-tt', states: true },
  { title: 'edit-my-tt', path: '/tabs/home/my-tt/edit', states: true },
  { title: 'entry-profiles', path: '/tabs/events/entry-profiles', states: true },
  { title: 'entry-prefill', path: '/tabs/events/entry-prefill', states: true },
  { title: 'signed-in-players', path: '/tabs/players' },
  { title: 'signed-in-tournaments', path: '/tabs/events' },
];

const UNSAFE = /delete|remove|sign out|sign in|install|update app|share|download|export|reset|clear all|unlink|disconnect|submit|save|confirm/i;
const REVIEWABLE = /filter|sort|view|overview|matches|results|fixtures|teams|players|standings|form|season|division|category|upcoming|completed|ranking|quality|coverage|data|identity|network|health|timeline|details/i;

test.describe.configure({ mode: 'serial' });

test.beforeAll(() => {
  mkdirSync(screenshotDir, { recursive: true });
  mkdirSync(diagnosticDir, { recursive: true });
});

function positiveInt(name: string, fallback: number): number {
  const value = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function requireBaseUrl(): string {
  const value = process.env.PREVIEW_URL?.trim();
  if (!value) throw new Error('PREVIEW_URL is required');
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('PREVIEW_URL must use HTTP or HTTPS');
  return url.toString().replace(/\/$/, '');
}

function urlFor(baseUrl: string, path: string): string {
  return new URL(path, `${baseUrl}/`).toString();
}

function slug(value: string): string {
  return value.replace(/[^a-z0-9]+/gi, '-').replace(/^-+|-+$/g, '').toLowerCase() || 'screen';
}

function redact(value: string): string {
  let result = value.replace(/([?&](?:token|key|secret|auth|code)=)[^&]+/gi, '$1[redacted]');
  for (const secret of [process.env.UI_AUDIT_PASSWORD, process.env.VITE_SUPABASE_PUBLISHABLE_KEY]) {
    if (secret) result = result.replaceAll(secret, '[redacted]');
  }
  return result.replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[jwt-redacted]');
}

function readManifest(): Entry[] {
  try {
    const value = JSON.parse(readFileSync(manifestPath, 'utf8')) as unknown;
    return Array.isArray(value) ? value as Entry[] : [];
  } catch {
    return [];
  }
}

function append(entry: Entry): void {
  const entries = readManifest().filter((item) => !(
    item.project === entry.project
    && item.section === entry.section
    && item.kind === entry.kind
    && item.title === entry.title
  ));
  entries.push(entry);
  entries.sort((a, b) => a.sequence - b.sequence);
  writeFileSync(manifestPath, `${JSON.stringify(entries, null, 2)}\n`);
}

function addUnique(target: string[], values: string[], limit = 25): void {
  for (const value of values) {
    if (target.length >= limit) return;
    if (value && !target.includes(value)) target.push(value);
  }
}

function collectIds(value: unknown, keys: Set<string>, output: string[] = []): string[] {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const item of value) collectIds(item, keys, output);
    return output;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (keys.has(key) && typeof child === 'string') output.push(child);
    collectIds(child, keys, output);
  }
  return output;
}

function collectArrayIds(value: unknown, arrayNames: Set<string>, output: string[] = []): string[] {
  if (!value || typeof value !== 'object') return output;
  if (Array.isArray(value)) {
    for (const item of value) collectArrayIds(item, arrayNames, output);
    return output;
  }
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (arrayNames.has(key) && Array.isArray(child)) {
      for (const item of child) {
        if (!item || typeof item !== 'object') continue;
        const id = (item as Record<string, unknown>).id;
        if (typeof id === 'string') output.push(id);
      }
    }
    collectArrayIds(child, arrayNames, output);
  }
  return output;
}

async function inspectResponse(response: Response, catalog: Catalog): Promise<void> {
  if (response.status() >= 400) return;
  const contentType = response.headers()['content-type'] ?? '';
  if (!contentType.includes('application/json')) return;
  const path = new URL(response.url()).pathname.replace(/^\/api/, '');
  const interesting = path.startsWith('/players/search')
    || path === '/events'
    || path === '/leagues'
    || path === '/leagues/dashboard'
    || /\/leagues\/[^/]+\/dashboard$/.test(path)
    || /\/teams\/[^/]+\/(?:summary|fixtures|roster|form)$/.test(path);
  if (!interesting) return;

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return;
  }

  if (path.startsWith('/players/search')) addUnique(catalog.playerIds, collectIds(payload, new Set(['id', 'player_id', 'playerId'])));
  if (path === '/events') addUnique(catalog.eventIds, collectIds(payload, new Set(['id', 'event_id', 'eventId'])));
  if (path === '/leagues') addUnique(catalog.leagueIds, collectIds(payload, new Set(['id', 'league_id', 'leagueId'])));
  addUnique(catalog.teamIds, collectIds(payload, new Set(['team_id', 'teamId'])));
  addUnique(catalog.teamIds, collectArrayIds(payload, new Set(['teams'])));
  addUnique(catalog.fixtureIds, collectIds(payload, new Set(['fixture_id', 'fixtureId'])));
  addUnique(catalog.fixtureIds, collectArrayIds(payload, new Set(['fixtures', 'recent_fixtures', 'upcoming_fixtures'])));
}

function installListeners(page: Page, catalog: Catalog, pending: Promise<void>[]): AuditEvent[] {
  const events: AuditEvent[] = [];
  page.on('pageerror', (error) => events.push({ type: 'pageerror', message: redact(error.message) }));
  page.on('console', (message) => {
    if (['warning', 'error'].includes(message.type())) {
      events.push({ type: 'console', message: redact(message.text()) });
    }
  });
  page.on('requestfailed', (request) => {
    events.push({ type: 'requestfailed', url: redact(request.url()), message: redact(request.failure()?.errorText ?? 'unknown') });
  });
  page.on('response', (response) => {
    if (response.status() >= 500) events.push({ type: 'response', url: redact(response.url()), status: response.status() });
    const task = inspectResponse(response, catalog);
    pending.push(task);
    void task.finally(() => {
      const index = pending.indexOf(task);
      if (index >= 0) pending.splice(index, 1);
    });
  });
  return events;
}

async function flush(context: Context): Promise<void> {
  if (context.pending.length > 0) await Promise.allSettled([...context.pending]);
}

async function prepare(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem('tt_players_league_onboarding_complete', 'true');
    localStorage.setItem('TTPlayers-Theme', 'light-mode');
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  });
}

async function settle(page: Page): Promise<void> {
  await page.waitForLoadState('domcontentloaded', { timeout: 15_000 }).catch(() => undefined);
  await page.waitForLoadState('networkidle', { timeout: 6_000 }).catch(() => undefined);
  await page.locator('body').waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined);
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => undefined);
  await page.addStyleTag({ content: '*{transition:none!important;animation:none!important;caret-color:transparent!important;scroll-behavior:auto!important}' }).catch(() => undefined);
  await page.evaluate(() => document.fonts.ready).catch(() => undefined);
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => undefined);
  await page.waitForTimeout(600);
}

async function capture(
  context: Context,
  section: Section,
  kind: Kind,
  title: string,
  pattern: string,
  requestedUrl: string,
  eventStart: number,
  fullPage: boolean,
): Promise<void> {
  context.sequence += 1;
  const prefix = `${String(context.sequence).padStart(3, '0')}-${context.project}-${section}-${kind}-${slug(title)}`;
  const screenshotPath = `screenshots/${prefix}.png`;
  const diagnosticsPath = `diagnostics/${prefix}.json`;
  const events = context.events.slice(eventStart);
  let actualFullPage = fullPage;

  mkdirSync(dirname(join(reportDir, screenshotPath)), { recursive: true });
  try {
    await context.page.screenshot({ path: join(reportDir, screenshotPath), fullPage, timeout: 30_000 });
  } catch {
    actualFullPage = false;
    await context.page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 15_000 });
  }

  const finalUrl = redact(context.page.url());
  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({
    requestedUrl: redact(requestedUrl),
    finalUrl,
    pattern,
    kind,
    events,
  }, null, 2)}\n`);

  append({
    sequence: context.sequence,
    project: context.project,
    section,
    kind,
    title,
    routePattern: pattern,
    requestedUrl: redact(requestedUrl),
    finalUrl,
    screenshotPath,
    diagnosticsPath,
    status: 'captured',
    fullPage: actualFullPage,
    eventCount: events.length,
  });
}

async function problem(
  context: Context,
  section: Section,
  kind: Kind,
  title: string,
  pattern: string,
  requestedUrl: string,
  status: Extract<Status, 'skipped' | 'error'>,
  reason: string,
): Promise<void> {
  context.sequence += 1;
  const prefix = `${String(context.sequence).padStart(3, '0')}-${context.project}-${section}-${kind}-${slug(title)}`;
  const screenshotPath = `screenshots/${prefix}.png`;
  const diagnosticsPath = `diagnostics/${prefix}.json`;
  let fallback = false;

  try {
    await settle(context.page);
    await context.page.screenshot({ path: join(reportDir, screenshotPath), fullPage: false, timeout: 10_000 });
    fallback = true;
  } catch {
    // Keep diagnostics even when the page cannot be captured.
  }

  writeFileSync(join(reportDir, diagnosticsPath), `${JSON.stringify({
    requestedUrl: redact(requestedUrl),
    finalUrl: redact(context.page.url()),
    pattern,
    kind,
    status,
    reason: redact(reason),
  }, null, 2)}\n`);

  append({
    sequence: context.sequence,
    project: context.project,
    section,
    kind,
    title,
    routePattern: pattern,
    requestedUrl: redact(requestedUrl),
    finalUrl: redact(context.page.url()),
    screenshotPath: fallback ? screenshotPath : undefined,
    diagnosticsPath,
    status,
    fullPage: false,
    eventCount: 0,
    reason: redact(reason),
  });
}

async function pageShot(context: Context, section: Section, route: RouteSpec): Promise<boolean> {
  const requestedUrl = urlFor(context.baseUrl, route.path);
  const eventStart = context.events.length;
  try {
    await context.page.goto(requestedUrl, { waitUntil: 'domcontentloaded', timeout: 45_000 });
    await settle(context.page);
    await capture(context, section, 'page', route.title, route.pattern ?? route.path, requestedUrl, eventStart, true);
    return true;
  } catch (error) {
    await problem(context, section, 'page', route.title, route.pattern ?? route.path, requestedUrl, 'error', error instanceof Error ? error.message : String(error));
    return false;
  }
}

async function stateShot(
  context: Context,
  section: Section,
  title: string,
  pattern: string,
  requestedUrl: string,
  action: () => Promise<void>,
  fullPage = false,
): Promise<void> {
  const eventStart = context.events.length;
  try {
    await action();
    await settle(context.page);
    await capture(context, section, 'state', title, pattern, requestedUrl, eventStart, fullPage);
  } catch (error) {
    await problem(context, section, 'state', title, pattern, requestedUrl, 'error', error instanceof Error ? error.message : String(error));
  }
}

async function searchInput(page: Page, label: RegExp, placeholder: RegExp): Promise<Locator | null> {
  const candidates = [
    page.getByRole('searchbox', { name: label }).first(),
    page.getByRole('textbox', { name: label }).first(),
    page.getByPlaceholder(placeholder).first(),
  ];
  for (const candidate of candidates) {
    if (await candidate.isVisible().catch(() => false)) return candidate;
  }
  return null;
}

async function searchStates(
  context: Context,
  section: Section,
  route: RouteSpec,
  label: RegExp,
  placeholder: RegExp,
  shortValue: string,
  fullValue: string,
): Promise<void> {
  const requestedUrl = urlFor(context.baseUrl, route.path);
  await context.page.goto(requestedUrl, { waitUntil: 'domcontentloaded' });
  await settle(context.page);
  const input = await searchInput(context.page, label, placeholder);
  if (!input) {
    await problem(context, section, 'state', `${route.title}-search`, route.path, requestedUrl, 'skipped', 'Search input was not rendered.');
    return;
  }
  await stateShot(context, section, `${route.title}-short-search`, route.path, requestedUrl, async () => {
    await input.fill(shortValue);
    await context.page.waitForTimeout(900);
  });

  await context.page.goto(requestedUrl, { waitUntil: 'domcontentloaded' });
  await settle(context.page);
  const resultsInput = await searchInput(context.page, label, placeholder);
  if (!resultsInput) return;
  await stateShot(context, section, `${route.title}-search-results`, route.path, requestedUrl, async () => {
    await resultsInput.fill(fullValue);
    await context.page.waitForTimeout(1_800);
  }, true);
  await flush(context);
}

async function openState(
  context: Context,
  section: Section,
  title: string,
  path: string,
  buttonName: RegExp,
): Promise<void> {
  const requestedUrl = urlFor(context.baseUrl, path);
  await context.page.goto(requestedUrl, { waitUntil: 'domcontentloaded' });
  await settle(context.page);
  const button = context.page.getByRole('button', { name: buttonName }).first();
  if (!await button.isVisible().catch(() => false)) {
    await problem(context, section, 'state', title, path, requestedUrl, 'skipped', 'Expected control was not rendered.');
    return;
  }
  await stateShot(context, section, title, path, requestedUrl, async () => {
    await button.click();
    await context.page.waitForTimeout(900);
  }, true);
  await context.page.keyboard.press('Escape').catch(() => undefined);
}

async function h2hPicker(context: Context): Promise<void> {
  const path = '/tabs/h2h';
  const requestedUrl = urlFor(context.baseUrl, path);
  await context.page.goto(requestedUrl, { waitUntil: 'domcontentloaded' });
  await settle(context.page);
  const button = context.page.getByRole('button', { name: /select player a/i }).first();
  if (!await button.isVisible().catch(() => false)) {
    await problem(context, 'anonymous', 'state', 'h2h-player-picker', path, requestedUrl, 'skipped', 'Player A picker was not rendered.');
    return;
  }
  await button.click();
  await stateShot(context, 'anonymous', 'h2h-player-picker', path, requestedUrl, async () => context.page.waitForTimeout(500), true);
  const input = context.page.getByLabel(/search players/i).first();
  if (await input.isVisible().catch(() => false)) {
    await stateShot(context, 'anonymous', 'h2h-player-picker-results', path, requestedUrl, async () => {
      await input.fill('Smith');
      await context.page.waitForTimeout(1_500);
    }, true);
    await flush(context);
  }
  await context.page.keyboard.press('Escape').catch(() => undefined);
}

async function controlName(control: Locator): Promise<string> {
  const aria = await control.getAttribute('aria-label').then((value) => value?.trim() ?? '').catch(() => '');
  if (aria) return aria;
  return control.innerText().then((value) => value.trim().replace(/\s+/g, ' ').slice(0, 90)).catch(() => '');
}

async function genericStates(context: Context, section: Section, route: RouteSpec): Promise<void> {
  const requestedUrl = urlFor(context.baseUrl, route.path);
  await context.page.goto(requestedUrl, { waitUntil: 'domcontentloaded' });
  await settle(context.page);
  const candidates = context.page.locator('[role="tab"], input[type="radio"], button[aria-expanded], button[aria-pressed], button');
  const descriptors: Array<{ role: 'button' | 'radio' | 'tab'; name: string }> = [];
  const seen = new Set<string>();
  const count = Math.min(await candidates.count().catch(() => 0), 40);

  for (let index = 0; index < count && descriptors.length < maxStates; index += 1) {
    const control = candidates.nth(index);
    if (!await control.isVisible().catch(() => false) || await control.isDisabled().catch(() => true)) continue;
    const name = await controlName(control);
    if (!name || UNSAFE.test(name)) continue;
    const role = await control.getAttribute('role') === 'tab'
      ? 'tab'
      : await control.getAttribute('type') === 'radio' ? 'radio' : 'button';
    if (role === 'button' && !REVIEWABLE.test(name)) {
      const expanded = await control.getAttribute('aria-expanded');
      const pressed = await control.getAttribute('aria-pressed');
      if (expanded === null && pressed === null) continue;
    }
    const key = `${role}:${name.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    descriptors.push({ role, name });
  }

  for (const descriptor of descriptors) {
    await context.page.goto(requestedUrl, { waitUntil: 'domcontentloaded' }).catch(() => undefined);
    await settle(context.page);
    const control = context.page.getByRole(descriptor.role, { name: descriptor.name, exact: true }).first();
    if (!await control.isVisible().catch(() => false)) continue;
    await stateShot(context, section, `${route.title}-${slug(descriptor.name)}`, route.pattern ?? route.path, requestedUrl, async () => {
      if (descriptor.role === 'radio') await control.click({ force: true });
      else await control.click();
      await context.page.waitForTimeout(650);
    });
    await context.page.keyboard.press('Escape').catch(() => undefined);
  }
}

function dynamicRoutes(catalog: Catalog): RouteSpec[] {
  const routes: RouteSpec[] = [];
  const [playerA, playerB] = catalog.playerIds;
  const eventId = catalog.eventIds[0];
  const leagueId = catalog.leagueIds[0];
  const teamId = catalog.teamIds[0];
  const fixtureId = catalog.fixtureIds[0];

  if (playerA) {
    routes.push(
      { title: 'player-detail-tab', path: `/tabs/players/player/${playerA}`, pattern: '/tabs/:tabId/player/:playerId', states: true },
      { title: 'player-insights-tab', path: `/tabs/players/player/${playerA}/insights`, pattern: '/tabs/:tabId/player/:playerId/insights', states: true },
      { title: 'player-matches-tab', path: `/tabs/players/player/${playerA}/matches`, pattern: '/tabs/:tabId/player/:playerId/matches', states: true },
      { title: 'player-tournaments-tab', path: `/tabs/players/player/${playerA}/tournaments`, pattern: '/tabs/:tabId/player/:playerId/tournaments', states: true },
      { title: 'player-journal-tab', path: `/tabs/players/player/${playerA}/journal`, pattern: '/tabs/:tabId/player/:playerId/journal', states: true },
      { title: 'player-detail-share', path: `/players/${playerA}`, pattern: '/players/:playerId' },
      { title: 'player-insights-share', path: `/players/${playerA}/insights`, pattern: '/players/:playerId/insights' },
      { title: 'player-matches-share', path: `/players/${playerA}/matches`, pattern: '/players/:playerId/matches' },
      { title: 'player-tournaments-share', path: `/players/${playerA}/tournaments`, pattern: '/players/:playerId/tournaments' },
      { title: 'player-journal-share', path: `/players/${playerA}/journal`, pattern: '/players/:playerId/journal' },
      { title: 'rating-audit-player-detail', path: `/rating-audit/player/${playerA}`, pattern: '/rating-audit/player/:playerId', states: true },
      { title: 'rating-audit-player-alias', path: `/rating-audit/${playerA}`, pattern: '/rating-audit/:playerId' },
    );
  }
  if (playerA && playerB) {
    routes.push(
      { title: 'h2h-detail', path: `/h2h/${playerA}/${playerB}`, pattern: '/h2h/:playerAId/:playerBId', states: true },
      { title: 'h2h-common-opponents-share', path: `/h2h/${playerA}/${playerB}/common-opponents`, pattern: '/h2h/:playerAId/:playerBId/common-opponents', states: true },
      { title: 'h2h-common-opponents-tab', path: `/tabs/h2h/h2h/${playerA}/${playerB}/common-opponents`, pattern: '/tabs/:tabId/h2h/:playerAId/:playerBId/common-opponents' },
    );
  }
  if (eventId) {
    routes.push(
      { title: 'tournament-detail-tab', path: `/tabs/events/event/${eventId}`, pattern: '/tabs/:tabId/event/:eventId', states: true },
      { title: 'tournament-detail-share', path: `/tournaments/${eventId}`, pattern: '/tournaments/:eventId' },
    );
  }
  if (leagueId) routes.push({ title: 'league-detail', path: `/tabs/leagues/league/${leagueId}`, pattern: '/tabs/:tabId/league/:leagueId', states: true });
  if (teamId) {
    routes.push(
      { title: 'team-detail-tab', path: `/tabs/leagues/team/${teamId}`, pattern: '/tabs/:tabId/team/:teamId', states: true },
      { title: 'team-detail-share', path: `/teams/${teamId}`, pattern: '/teams/:teamId' },
    );
  }
  if (fixtureId) routes.push({ title: 'fixture-detail', path: `/tabs/leagues/fixture/${fixtureId}`, pattern: '/tabs/:tabId/fixture/:fixtureId', states: true });
  return routes;
}

async function missingDynamic(context: Context): Promise<void> {
  const checks: Array<[string, boolean, string, string]> = [
    ['player-pages', context.catalog.playerIds.length > 0, '/players/:playerId', 'No representative player was discovered from player search.'],
    ['h2h-pages', context.catalog.playerIds.length > 1, '/h2h/:playerAId/:playerBId', 'Two representative players were not discovered.'],
    ['tournament-pages', context.catalog.eventIds.length > 0, '/tournaments/:eventId', 'No representative tournament was discovered.'],
    ['league-pages', context.catalog.leagueIds.length > 0, '/tabs/:tabId/league/:leagueId', 'No representative league was discovered.'],
    ['team-pages', context.catalog.teamIds.length > 0, '/teams/:teamId', 'No representative team was discovered from league data.'],
    ['fixture-pages', context.catalog.fixtureIds.length > 0, '/tabs/:tabId/fixture/:fixtureId', 'No representative fixture was discovered from league or team data.'],
  ];
  for (const [title, available, pattern, reason] of checks) {
    if (!available) await problem(context, 'anonymous', 'page', title, pattern, context.baseUrl, 'skipped', reason);
  }
}

async function authenticated(context: Context): Promise<void> {
  const credentials = {
    supabaseUrl: process.env.VITE_SUPABASE_URL?.trim() ?? '',
    publishableKey: process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '',
    email: process.env.UI_AUDIT_EMAIL?.trim() ?? '',
    password: process.env.UI_AUDIT_PASSWORD?.trim() ?? '',
  };
  const homeUrl = urlFor(context.baseUrl, '/tabs/home');
  if (Object.values(credentials).some((value) => !value)) {
    await problem(context, 'authenticated', 'page', 'authenticated-pages', 'authenticated', homeUrl, 'skipped', 'Synthetic-user credentials are not configured.');
    return;
  }
  try {
    await context.page.goto(homeUrl, { waitUntil: 'domcontentloaded' });
    await signInSyntheticUser(context.page, credentials);
    await context.page.reload({ waitUntil: 'domcontentloaded' });
    await settle(context.page);
  } catch (error) {
    await problem(context, 'authenticated', 'page', 'synthetic-user-sign-in', 'authenticated', homeUrl, 'error', error instanceof Error ? error.message : String(error));
    return;
  }
  for (const route of AUTH_ROUTES) {
    if (await pageShot(context, 'authenticated', route) && route.states) await genericStates(context, 'authenticated', route);
  }
  await openState(context, 'authenticated', 'signed-in-drawer', '/tabs/home', /open menu/i);
  await searchStates(context, 'authenticated', { title: 'signed-in-players', path: '/tabs/players' }, /search all players/i, /search all players/i, 'Sm', 'Smith');
  await searchStates(context, 'authenticated', { title: 'signed-in-tournaments', path: '/tabs/events' }, /search.*tournament/i, /search.*tournament/i, 'Op', 'Open');
}

function html(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

function writeReport(baseUrl: string, catalog: Catalog): void {
  const entries = readManifest();
  const counts = {
    pages: entries.filter((entry) => entry.kind === 'page').length,
    states: entries.filter((entry) => entry.kind === 'state').length,
    captured: entries.filter((entry) => entry.status === 'captured').length,
    skipped: entries.filter((entry) => entry.status === 'skipped').length,
    errors: entries.filter((entry) => entry.status === 'error').length,
    diagnostics: entries.reduce((total, entry) => total + entry.eventCount, 0),
  };
  writeFileSync(join(reportDir, 'coverage.json'), `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    target: baseUrl,
    commit: process.env.GITHUB_SHA ?? 'local',
    catalog,
    counts,
    gaps: entries.filter((entry) => entry.status !== 'captured'),
  }, null, 2)}\n`);

  const cards = entries.map((entry) => `<article data-project="${html(entry.project)}" data-kind="${entry.kind}" data-status="${entry.status}" data-search="${html(`${entry.title} ${entry.routePattern}`.toLowerCase())}" class="${entry.status}">
<div class="head"><div><small>${html(entry.project)} · ${entry.section} · ${entry.kind}</small><h2>${html(entry.title)}</h2></div><b>${entry.status}</b></div>
${entry.screenshotPath ? `<a href="${html(entry.screenshotPath)}"><img src="${html(entry.screenshotPath)}" loading="lazy" alt="${html(entry.title)}"></a>` : ''}
<p><code>${html(entry.routePattern)}</code></p><p>${entry.fullPage ? 'Full page' : 'Viewport'} · ${entry.eventCount} diagnostics</p>
${entry.reason ? `<p class="reason">${html(entry.reason)}</p>` : ''}<p><a href="${html(entry.finalUrl)}">Open target</a> · <a href="${html(entry.diagnosticsPath)}">Diagnostics</a></p></article>`).join('');

  writeFileSync(join(reportDir, 'index.html'), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>TT Players Main UI Audit</title><style>
*{box-sizing:border-box}body{margin:0;font-family:system-ui,sans-serif;background:#f4f6f4;color:#17211d}main{max-width:1600px;margin:auto;padding:24px}header{position:sticky;top:0;z-index:2;background:#f4f6f4ee;backdrop-filter:blur(12px);padding:20px 0;border-bottom:1px solid #d7ded9}h1{margin:0}.summary,.filters{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.summary span,.head b{background:#fff;border:1px solid #ccd6cf;border-radius:999px;padding:5px 9px}.filters input,.filters select{min-height:40px;border:1px solid #bdc9c1;border-radius:10px;background:#fff;padding:8px}.filters input{flex:1;min-width:260px}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(310px,1fr));gap:16px;margin-top:20px}article{background:#fff;border:1px solid #d7ded9;border-radius:14px;padding:14px}article.skipped{border-style:dashed}article.error{border-color:#b85858}.head{display:flex;justify-content:space-between;gap:10px}.head h2{margin:4px 0;font-size:1.05rem}.head small{color:#607068}img{width:100%;height:420px;object-fit:contain;object-position:top;background:#eef2ef;border:1px solid #d7ded9;border-radius:8px}.reason{color:#842f2f}a{color:#0d6755}.hidden{display:none}
</style></head><body><main><header><h1>TT Players Main UI Audit</h1><p>Screenshot collection only; diagnostics and coverage gaps do not act as visual assertions.</p><p>Target: <a href="${html(baseUrl)}">${html(baseUrl)}</a> · Commit: <code>${html(process.env.GITHUB_SHA ?? 'local')}</code></p><div class="summary"><span>${counts.pages} pages</span><span>${counts.states} function states</span><span>${counts.captured} captured</span><span>${counts.skipped} skipped</span><span>${counts.errors} errors</span><span>${counts.diagnostics} diagnostics</span><a href="coverage.json">Coverage JSON</a></div><div class="filters"><input id="q" type="search" placeholder="Filter by page or route"><select id="project"><option value="">All viewports</option><option value="mobile-390">Mobile 390</option><option value="desktop-1440">Desktop 1440</option></select><select id="kind"><option value="">Pages and states</option><option value="page">Pages</option><option value="state">Function states</option></select><select id="status"><option value="">All statuses</option><option value="captured">Captured</option><option value="skipped">Skipped</option><option value="error">Error</option></select></div></header><section class="grid">${cards}</section></main><script>
const q=document.querySelector('#q'),project=document.querySelector('#project'),kind=document.querySelector('#kind'),status=document.querySelector('#status'),cards=[...document.querySelectorAll('article')];function apply(){const text=q.value.toLowerCase();for(const card of cards){const show=(!text||card.dataset.search.includes(text))&&(!project.value||card.dataset.project===project.value)&&(!kind.value||card.dataset.kind===kind.value)&&(!status.value||card.dataset.status===status.value);card.classList.toggle('hidden',!show)}}[q,project,kind,status].forEach(x=>{x.addEventListener('input',apply);x.addEventListener('change',apply)});
</script></body></html>\n`);
}

test('collects comprehensive page and function screenshots for UI/UX audit', async ({ page }, testInfo: TestInfo) => {
  const baseUrl = requireBaseUrl();
  await prepare(page);
  const catalog: Catalog = { playerIds: [], eventIds: [], leagueIds: [], teamIds: [], fixtureIds: [] };
  const pending: Promise<void>[] = [];
  const context: Context = {
    page,
    project: testInfo.project.name,
    baseUrl,
    catalog,
    pending,
    events: installListeners(page, catalog, pending),
    sequence: readManifest().reduce((max, entry) => Math.max(max, entry.sequence), 0),
  };

  try {
    for (const route of PUBLIC_ROUTES) {
      if (await pageShot(context, 'anonymous', route) && route.states) await genericStates(context, 'anonymous', route);
    }

    await openState(context, 'anonymous', 'main-drawer', '/tabs/home', /open menu/i);
    await searchStates(context, 'anonymous', { title: 'players', path: '/tabs/players' }, /search all players/i, /search all players/i, 'Sm', 'Smith');
    await searchStates(context, 'anonymous', { title: 'tournaments', path: '/tabs/events' }, /search.*tournament/i, /search.*tournament/i, 'Op', 'Open');
    await openState(context, 'anonymous', 'tournament-filters', '/tabs/events', /category filters|filter tournaments|filters/i);
    await h2hPicker(context);
    await openState(context, 'anonymous', 'league-selector', '/tabs/leagues', /select leagues|filter leagues|choose leagues/i);
    await flush(context);

    if (catalog.leagueIds[0]) {
      await page.evaluate((leagueId) => {
        localStorage.setItem('tt_players_selected_league_ids', JSON.stringify([leagueId]));
        localStorage.setItem('tt_players_league_onboarding_complete', 'true');
      }, catalog.leagueIds[0]);
      const selectedRoute = { title: 'leagues-selected-dashboard', path: '/tabs/leagues', states: true };
      if (await pageShot(context, 'anonymous', selectedRoute)) await genericStates(context, 'anonymous', selectedRoute);
      await flush(context);
    }

    let routes = dynamicRoutes(catalog);
    for (const route of routes.filter((item) => item.title === 'league-detail')) {
      if (await pageShot(context, 'anonymous', route) && route.states) await genericStates(context, 'anonymous', route);
    }
    await flush(context);

    routes = dynamicRoutes(catalog);
    for (const route of routes.filter((item) => item.title !== 'league-detail')) {
      if (await pageShot(context, 'anonymous', route) && route.states) await genericStates(context, 'anonymous', route);
    }

    await missingDynamic(context);
    await authenticated(context);
  } catch (error) {
    await problem(context, 'anonymous', 'page', 'audit-run', 'audit-run', baseUrl, 'error', error instanceof Error ? error.message : String(error));
  } finally {
    await flush(context);
    writeReport(baseUrl, catalog);
  }
});
