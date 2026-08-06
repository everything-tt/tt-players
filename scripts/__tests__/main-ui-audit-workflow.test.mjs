import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../.github/workflows/main-ui-audit.yml', import.meta.url);
const buildWorkflowUrl = new URL('../../.github/workflows/build.yml', import.meta.url);
const playwrightConfigUrl = new URL('../../playwright.main-audit.config.ts', import.meta.url);
const auditTestUrl = new URL(
  '../../apps/mobile/tests/main-audit/screenshot-audit.pw.ts',
  import.meta.url,
);

function extractJob(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${jobName} job in workflow`);
  const rest = workflow.slice(start + marker.length);
  const nextJob = rest.search(/^  [a-zA-Z0-9_-]+:\n/m);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

test('main UI audit is an explicit manual workflow', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const job = extractJob(workflow, 'audit');

  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /target_url:/);
  assert.match(workflow, /default:\s*https:\/\/ttp\.tourneypilot\.com/);
  assert.doesNotMatch(workflow, /^  push:/m);
  assert.doesNotMatch(workflow, /^  pull_request:/m);
  assert.match(job, /PREVIEW_URL:\s*\$\{\{ inputs\.target_url \}\}/);
  assert.match(job, /playwright\.main-audit\.config\.ts/);
  assert.doesNotMatch(job, /continue-on-error:\s*true/);
});

test('main UI audit publishes an aliased draft report and keeps failure evidence', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const job = extractJob(workflow, 'audit');

  assert.match(job, /if:\s*always\(\)/);
  assert.match(job, /name:\s*main-ui-audit-\$\{\{ github\.run_id \}\}-\$\{\{ github\.run_attempt \}\}/);
  assert.match(job, /ui-review-report\//);
  assert.match(job, /test-results\/main-audit\//);
  assert.match(job, /retention-days:\s*30/);
  assert.match(job, /GITHUB_STEP_SUMMARY/);
  assert.match(job, /pnpm --package=netlify-cli@27\.0\.1 dlx netlify deploy/);
  assert.match(job, /--alias="\$NETLIFY_ALIAS"/);
  assert.match(job, /--context=deploy-preview/);
  assert.match(job, /--no-build/);
  assert.match(job, /Expected an aliased draft deploy/);
  assert.match(job, /Refusing to use the production frontend URL/);
  assert.match(job, /NETLIFY_SITE_ID/);
  assert.doesNotMatch(job, /actions-netlify/);
  assert.doesNotMatch(job, /pnpm dlx netlify-cli/);
  assert.doesNotMatch(job, /--prod(?:\s|$)/m);
});

test('frontend deployment workflow no longer owns the broad main audit', async () => {
  const workflow = await readFile(buildWorkflowUrl, 'utf8');

  assert.doesNotMatch(workflow, /^  main-ui-audit:/m);
  assert.doesNotMatch(workflow, /playwright\.main-audit\.config\.ts/);
  assert.doesNotMatch(workflow, /apps\/mobile\/tests\/main-audit/);
});

test('main audit records diagnostics without turning the report into verification', async () => {
  const auditTest = await readFile(auditTestUrl, 'utf8');

  assert.match(auditTest, /pageerror/);
  assert.match(auditTest, /requestfailed/);
  assert.match(auditTest, /eventCount/);
  assert.match(auditTest, /status:\s*'captured'/);
  assert.match(auditTest, /type AuditStatus = 'captured' \| 'skipped' \| 'error'/);
  assert.doesNotMatch(auditTest, /assertNoAuditFailures/);
});

test('main UI audit never retains browser traces containing authenticated traffic', async () => {
  const config = await readFile(playwrightConfigUrl, 'utf8');

  assert.match(config, /trace:\s*'off'/);
  assert.doesNotMatch(config, /trace:\s*'retain-on-failure'/);
});
