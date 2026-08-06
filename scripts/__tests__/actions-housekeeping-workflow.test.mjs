import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL(
  '../../.github/workflows/actions-housekeeping.yml',
  import.meta.url,
);

test('actions housekeeping runs after workflow changes and on a weekly schedule', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /^  push:\n/m);
  assert.match(workflow, /branches:\s*\[main\]/);
  assert.match(workflow, /'\.github\/workflows\/\*\*'/);
  assert.match(workflow, /workflow_dispatch:/);
  assert.match(workflow, /dry_run:/);
  assert.match(workflow, /default:\s*true/);
  assert.match(workflow, /type:\s*boolean/);
  assert.match(workflow, /schedule:/);
  assert.match(workflow, /cron:\s*'23 3 \* \* 0'/);
  assert.match(workflow, /actions:\s*write/);
});

test('actions housekeeping only targets workflows missing from the default branch', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /default_branch=\$\(gh api "repos\/\$GH_REPO" --jq '\.default_branch'\)/);
  assert.match(
    workflow,
    /repos\/\$GH_REPO\/contents\/\$workflow_path\?ref=\$default_branch/,
  );
  assert.match(workflow, /active_workflows=\$\(\(active_workflows \+ 1\)\)/);
  assert.match(workflow, /retired_workflows=\$\(\(retired_workflows \+ 1\)\)/);
});

test('actions housekeeping preserves non-completed runs and supports report-only execution', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /if \[\[ "\$run_status" != completed \]\]/);
  assert.match(workflow, /skipped non-completed run/);
  assert.match(workflow, /if \[\[ "\$dry_run" == true \]\]/);
  assert.match(workflow, /would delete run/);
  assert.match(workflow, /gh api --method DELETE "repos\/\$GH_REPO\/actions\/runs\/\$run_id"/);
});

test('actions housekeeping always publishes a failure-aware summary', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');

  assert.match(workflow, /id:\s*prune/);
  assert.match(workflow, /name:\s*Add housekeeping summary/);
  assert.match(workflow, /if:\s*always\(\)/);
  assert.match(workflow, /PRUNE_OUTCOME:\s*\$\{\{ steps\.prune\.outcome \}\}/);
  assert.match(workflow, /GITHUB_STEP_SUMMARY/);
  assert.match(workflow, /Deletion failures/);
});
