import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..', '..');
const workflow = readFileSync(join(root, '.github', 'workflows', 'vps-deploy.yml'), 'utf8');

test('runtime cutover preserves the production serialization and release safety gates', () => {
  assert.match(workflow, /concurrency:\s*\n\s*group:\s*vps-production-ttp\s*\n\s*cancel-in-progress:\s*false/);
  assert.match(workflow, /name: Backend quality gate/);
  assert.match(workflow, /pnpm run check:backend/);
  assert.match(workflow, /name: Determine database compatibility boundary/);
  assert.match(workflow, /packages\/db/);
  assert.match(workflow, /scripts\/migrate-vps-postgres\.sh/);
  assert.match(workflow, /infra\/postgres/);
  assert.match(workflow, /database_changed=true/);
  assert.match(workflow, /db_fingerprint=/);
  assert.match(workflow, /scripts\/deploy-vps-release\.sh/);
  assert.match(workflow, /\/opt\/tt-players\/releases\/\$RELEASE_SHA/);
  assert.match(workflow, /https:\/\/ttp-api\.tourneypilot\.com\/api\/health\b/);
  assert.match(workflow, /https:\/\/ttp-api\.tourneypilot\.com\/api\/health\/db\b/);
});

test('runtime cutover consumes Parameter Manager but keeps multiline SSH direct and protected', () => {
  assert.match(workflow, /TT_PLAYERS_RUNTIME_PARAMETER:\s*tt-players-runtime-prod/);
  assert.match(workflow, /gcloud parametermanager parameters versions render latest/);
  assert.match(workflow, /--format="value\(renderedPayload\)"/);
  assert.match(workflow, /\| base64 -d > "\$CONFIG_FILE"/);
  assert.match(workflow, /gcloud secrets versions access latest/);
  assert.match(workflow, /--secret="\$rendered_ssh_secret_id" > "\$SSH_KEY_FILE"/);
  assert.match(workflow, /install -m 600 "\$SSH_KEY_FILE" ~\/\.ssh\/id_ed25519/);
  assert.doesNotMatch(workflow, /google-github-actions\/get-secretmanager-secrets@v3/);
});

test('runtime cutover does not use migrated repository Variables', () => {
  for (const variable of [
    'TT_PLAYERS_RUNTIME_CONFIG_WIF_PROVIDER',
    'TT_PLAYERS_RUNTIME_SERVICE_ACCOUNT',
    'TT_PLAYERS_VPS_HOST',
    'TT_PLAYERS_VPS_USER',
    'TT_PLAYERS_VPS_HOST_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ]) {
    assert.ok(!workflow.includes(`vars.${variable}`), `unexpected repository Variable reference: ${variable}`);
  }
});

test('rendered config and SSH material are not logged, uploaded, or persisted', () => {
  assert.doesNotMatch(workflow, /cat "?\$CONFIG_FILE|cat "?\$SSH_KEY_FILE/);
  assert.doesNotMatch(workflow, /actions\/upload-artifact/);
  assert.doesNotMatch(workflow, /GITHUB_OUTPUT.*(CLOUDFLARE|OLLAMA|SUPABASE)|(?:CLOUDFLARE|OLLAMA|SUPABASE).*GITHUB_OUTPUT/);
  assert.match(workflow, /rm -f "\$CONFIG_FILE"/);
  assert.match(workflow, /rm -f "\$SSH_KEY_FILE"/);
  assert.match(workflow, /gha-creds-\*\.json/);
});
