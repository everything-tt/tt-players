import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..', '..');
const workflowPath = join(root, '.github', 'workflows', 'parameter-manager-shadow.yml');
const workflow = readFileSync(workflowPath, 'utf8');

test('Parameter Manager shadow workflow is manual-only and uses the production runtime identity', () => {
  assert.match(workflow, /workflow_dispatch:/);
  assert.doesNotMatch(workflow, /\n\s+push:/);
  assert.doesNotMatch(workflow, /\n\s+pull_request:/);
  assert.match(workflow, /projects\/126174378735\/locations\/global\/workloadIdentityPools\/tt-players-actions\/providers\/runtime-config/);
  assert.match(workflow, /tt-players-runtime-reader@wudong-agent-master\.iam\.gserviceaccount\.com/);
  assert.match(workflow, /TT_PLAYERS_RUNTIME_PARAMETER:\s*tt-players-runtime-prod/);
  assert.doesNotMatch(workflow, /runtime-shadow|tt-players-shadow-reader/);
  assert.doesNotMatch(workflow, /vars\.TT_PLAYERS_(RUNTIME_CONFIG_WIF_PROVIDER|RUNTIME_SERVICE_ACCOUNT)/);
});

test('shadow render installs gcloud and decodes renderedPayload into a protected file', () => {
  assert.match(workflow, /google-github-actions\/auth@v3/);
  assert.match(workflow, /google-github-actions\/setup-gcloud@v3/);
  assert.match(workflow, /umask 077/);
  assert.match(workflow, /CONFIG_FILE="\$\(mktemp\)"/);
  assert.match(workflow, /chmod 600 "\$CONFIG_FILE" "\$SSH_KEY_FILE"/);
  assert.match(workflow, /gcloud parametermanager parameters versions render latest/);
  assert.match(workflow, /--parameter="\$TT_PLAYERS_RUNTIME_PARAMETER"/);
  assert.match(workflow, /--format="value\(renderedPayload\)"/);
  assert.match(workflow, /\| base64 -d > "\$CONFIG_FILE"/);
  assert.match(workflow, /\.schema_version == 1/);
  assert.doesNotMatch(workflow, /cat "?\$CONFIG_FILE/);
  assert.doesNotMatch(workflow, /GITHUB_OUTPUT.*CONFIG_FILE|CONFIG_FILE.*GITHUB_OUTPUT/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact/);
});

test('shadow comparison covers current runtime non-secret config without logging values', () => {
  for (const reference of [
    'vars.TT_PLAYERS_VPS_HOST',
    'vars.TT_PLAYERS_VPS_USER',
    'vars.TT_PLAYERS_VPS_HOST_KEY',
    'vars.VITE_SUPABASE_URL',
    'vars.VITE_SUPABASE_PUBLISHABLE_KEY',
    '.entry_form_llm.base_url',
    '.entry_form_llm.model',
  ]) {
    assert.ok(workflow.includes(reference), `missing shadow comparison reference: ${reference}`);
  }

  assert.match(workflow, /differs between Parameter Manager and the current production source/);
  assert.doesNotMatch(workflow, /echo .*\$actual/);
  assert.doesNotMatch(workflow, /echo .*\$expected/);
});

test('shadow validation checks rendered secrets and direct SSH-key access without logging secret contents', () => {
  for (const path of [
    '.secrets.cloudflare_account_id',
    '.secrets.cloudflare_ai_api_token',
    '.secrets.ollama_api_key',
    '.secrets.vps_ssh_key_secret_id',
  ]) {
    assert.ok(workflow.includes(path), `missing secret validation check: ${path}`);
  }

  assert.match(workflow, /VPS_SSH_KEY_SECRET_ID:\s*tt-players-hetzner-vps-deploy-key/);
  assert.match(workflow, /gcloud secrets versions access latest/);
  assert.match(workflow, /--secret="\$rendered_ssh_secret_id" > "\$SSH_KEY_FILE"/);
  assert.match(workflow, /BEGIN OPENSSH PRIVATE KEY/);
  assert.doesNotMatch(workflow, /get-secretmanager-secrets/);
  assert.doesNotMatch(workflow, /echo .*SSH_KEY_FILE|cat .*SSH_KEY_FILE/);
});

test('shadow workflow always removes rendered config, private key, and temporary Google credentials', () => {
  assert.match(workflow, /if: always\(\)/);
  assert.match(workflow, /rm -f "\$CONFIG_FILE"/);
  assert.match(workflow, /rm -f "\$SSH_KEY_FILE"/);
  assert.match(workflow, /gha-creds-\*\.json/);
});
