import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../../.github/workflows/build.yml', import.meta.url);
const playwrightConfigUrl = new URL('../../playwright.main-audit.config.ts', import.meta.url);

function extractJob(workflow, jobName) {
  const marker = `  ${jobName}:\n`;
  const start = workflow.indexOf(marker);
  assert.notEqual(start, -1, `Expected ${jobName} job in build workflow`);
  const rest = workflow.slice(start + marker.length);
  const nextJob = rest.search(/^  [a-zA-Z0-9_-]+:\n/m);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

test('main UI audit is post-deploy and non-blocking', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const job = extractJob(workflow, 'main-ui-audit');

  assert.match(job, /github\.event_name == 'push'/);
  assert.match(job, /github\.ref == 'refs\/heads\/main'/);
  assert.match(job, /needs:\s*build-deploy/);
  assert.match(job, /continue-on-error:\s*true/);
  assert.match(job, /playwright\.main-audit\.config\.ts/);
});

test('main UI audit always publishes evidence without creating PR comments', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const job = extractJob(workflow, 'main-ui-audit');

  assert.match(job, /name:\s*main-ui-audit-\$\{\{ github\.sha \}\}/);
  assert.match(job, /if:\s*always\(\)/);
  assert.match(job, /alias:\s*ui-audit-main/);
  assert.match(job, /GITHUB_STEP_SUMMARY/);
  assert.doesNotMatch(job, /Comment UI screenshots on PR/);
});

test('main UI audit never retains browser traces containing authenticated traffic', async () => {
  const config = await readFile(playwrightConfigUrl, 'utf8');

  assert.match(config, /trace:\s*'off'/);
  assert.doesNotMatch(config, /trace:\s*'retain-on-failure'/);
});
