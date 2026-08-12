import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const root = join(import.meta.dirname, '..', '..');
const workflowDir = join(root, '.github', 'workflows');

const productionWorkflows = [
  'vps-deploy.yml',
  'vps-rollback.yml',
  'rating-audit-snapshot.yml',
  'rating-backtest.yml',
  'rating-rebuild.yml',
  'repair-player-aliases.yml',
  'sport80-competition-match-preview.yml',
  'tournament-entry-form-backfill.yml',
  'tte-calendar-sync.yml',
  'build.yml',
];

const deferredWorkflows = new Set(['main-ui-audit.yml']);

const sshWorkflows = [
  'vps-deploy.yml',
  'vps-rollback.yml',
  'rating-audit-snapshot.yml',
  'rating-backtest.yml',
  'rating-rebuild.yml',
  'repair-player-aliases.yml',
  'sport80-competition-match-preview.yml',
  'tournament-entry-form-backfill.yml',
  'tte-calendar-sync.yml',
  'vps-ssh-canary.yml',
];

function readWorkflow(name) {
  return readFileSync(join(workflowDir, name), 'utf8');
}

function jobBlocks(source) {
  const lines = source.split(/\r?\n/);
  const jobs = new Map();
  let current = null;
  for (const line of lines) {
    const match = line.match(/^  ([A-Za-z0-9_-]+):$/);
    if (match) {
      current = { name: match[1], lines: [line] };
      jobs.set(match[1], current);
      continue;
    }
    if (current) current.lines.push(line);
  }
  return new Map([...jobs].map(([name, job]) => [name, job.lines.join('\n')]));
}

test('production workflows use workload-specific GCP configuration and secret loading', () => {
  for (const name of productionWorkflows) {
    const source = readWorkflow(name);
    const jobs = jobBlocks(source);
    const authJobs = [...jobs.values()].filter((job) => job.includes('google-github-actions/auth@v3'));

    assert.ok(authJobs.length > 0, `${name} must authenticate to Google Cloud`);
    assert.ok(!source.includes('tt-players-full-config'), `${name} must not fetch the full-config bundle`);
    assert.ok(!source.includes('tt-players-database-url'), `${name} must not fetch the database URL`);
    assert.ok(!/\$\{\{\s*secrets\.(VPS_HOST|VPS_USER|VPS_SSH_KEY|CLOUDFLARE_|OLLAMA_API_KEY|UI_AUDIT_|VITE_SUPABASE_)/.test(source), `${name} retains a migrated GitHub secret reference`);

    if (name === 'vps-deploy.yml') {
      assert.match(source, /google-github-actions\/setup-gcloud@v3/);
      assert.match(source, /gcloud parametermanager parameters versions render latest/);
      assert.match(source, /gcloud secrets versions access latest/);
      assert.doesNotMatch(source, /google-github-actions\/get-secretmanager-secrets@v3/);
    } else {
      assert.ok(source.includes('google-github-actions/get-secretmanager-secrets@v3'), `${name} must load Secret Manager values`);
    }

    for (const job of authJobs) {
      assert.match(job, /id-token:\s*write/, `${name} auth job must have job-scoped id-token permission`);
      const checkout = job.indexOf('uses: actions/checkout@v4');
      const auth = job.indexOf('uses: google-github-actions/auth@v3');
      assert.ok(checkout >= 0 && checkout < auth, `${name} must checkout before Google auth`);
    }
  }
});

test('pull-request paths cannot request production identity or credentials', () => {
  const source = readWorkflow('build.yml');
  const jobs = jobBlocks(source);

  assert.ok(source.includes('pull_request:'), 'build workflow must retain pull-request builds');
  assert.match(jobs.get('build'), /VITE_SUPABASE_URL:\s*\$\{\{\s*vars\.VITE_SUPABASE_URL\s*\}\}/);
  assert.doesNotMatch(jobs.get('build'), /id-token:\s*write|google-github-actions\/(auth|get-secretmanager-secrets)|\$\{\{\s*secrets\./);

  const production = jobs.get('deploy-production');
  assert.match(production, /if:.*github\.event_name == 'push'/s);
  assert.match(production, /id-token:\s*write/);
  assert.doesNotMatch(production, /pull_request/);
  assert.match(production, /TT_PLAYERS_FRONTEND_WIF_PROVIDER/);

  for (const name of ['preview-deploy', 'ui-report-deploy']) {
    const job = jobs.get(name);
    assert.match(job, /github\.event\.pull_request\.head\.repo\.full_name == github\.repository/);
    assert.match(job, /NETLIFY_AUTH_TOKEN:\s*\$\{\{\s*secrets\.NETLIFY_AUTH_TOKEN\s*\}\}/);
    assert.doesNotMatch(job, /id-token:\s*write|google-github-actions\/(auth|get-secretmanager-secrets)/);
  }

  assert.doesNotMatch(jobs.get('ui-screenshots'), /NETLIFY_AUTH_TOKEN|google-github-actions|id-token:\s*write/);
});

test('VPS runtime deployment commits stable bootstrap coordinates and no longer reads migrated GitHub Variables', () => {
  const source = readWorkflow('vps-deploy.yml');

  assert.match(source, /GCP_PROJECT_ID:\s*wudong-agent-master/);
  assert.match(source, /TT_PLAYERS_RUNTIME_WIF_PROVIDER:\s*projects\/126174378735\/locations\/global\/workloadIdentityPools\/tt-players-actions\/providers\/runtime-config/);
  assert.match(source, /TT_PLAYERS_RUNTIME_SERVICE_ACCOUNT:\s*tt-players-runtime-reader@wudong-agent-master\.iam\.gserviceaccount\.com/);
  assert.match(source, /TT_PLAYERS_RUNTIME_PARAMETER:\s*tt-players-runtime-prod/);
  assert.match(source, /service_account:\s*\$\{\{\s*env\.TT_PLAYERS_RUNTIME_SERVICE_ACCOUNT\s*\}\}/);

  for (const variable of [
    'TT_PLAYERS_RUNTIME_CONFIG_WIF_PROVIDER',
    'TT_PLAYERS_RUNTIME_SERVICE_ACCOUNT',
    'TT_PLAYERS_VPS_HOST',
    'TT_PLAYERS_VPS_USER',
    'TT_PLAYERS_VPS_HOST_KEY',
    'VITE_SUPABASE_URL',
    'VITE_SUPABASE_PUBLISHABLE_KEY',
  ]) {
    assert.ok(!source.includes(`vars.${variable}`), `vps-deploy.yml still reads vars.${variable}`);
  }

  assert.doesNotMatch(source, /TT_PLAYERS_RUNTIME_CONFIG_SERVICE_ACCOUNT/);
});

test('VPS runtime deployment renders Parameter Manager securely and reads only the named multiline SSH secret directly', () => {
  const source = readWorkflow('vps-deploy.yml');

  assert.match(source, /umask 077/);
  assert.match(source, /CONFIG_FILE="\$\(mktemp\)"/);
  assert.match(source, /SSH_KEY_FILE="\$\(mktemp\)"/);
  assert.match(source, /chmod 600 "\$CONFIG_FILE" "\$SSH_KEY_FILE"/);
  assert.match(source, /--format="value\(renderedPayload\)"/);
  assert.match(source, /\| base64 -d > "\$CONFIG_FILE"/);
  assert.match(source, /\.schema_version == 1/);
  assert.match(source, /\.secrets\.vps_ssh_key_secret_id/);
  assert.match(source, /gcloud secrets versions access latest/);
  assert.match(source, /--secret="\$rendered_ssh_secret_id" > "\$SSH_KEY_FILE"/);
  assert.match(source, /BEGIN OPENSSH PRIVATE KEY/);
  assert.doesNotMatch(source, /get-secretmanager-secrets/);
  assert.doesNotMatch(source, /cat "?\$CONFIG_FILE|cat "?\$SSH_KEY_FILE/);
  assert.doesNotMatch(source, /actions\/upload-artifact/);
});

test('VPS runtime consumers read config from the rendered file without exporting secret values', () => {
  const source = readWorkflow('vps-deploy.yml');

  for (const path of [
    '.vps.host',
    '.vps.user',
    '.vps.host_key',
    '.api.supabase_url',
    '.api.supabase_publishable_key',
    '.secrets.cloudflare_account_id',
    '.secrets.cloudflare_ai_api_token',
    '.secrets.ollama_api_key',
    '.entry_form_llm.base_url',
    '.entry_form_llm.model',
  ]) {
    assert.ok(source.includes(path), `vps-deploy.yml does not consume ${path}`);
  }

  assert.doesNotMatch(source, /GITHUB_OUTPUT.*(CLOUDFLARE|OLLAMA|SUPABASE)|(?:CLOUDFLARE|OLLAMA|SUPABASE).*GITHUB_OUTPUT/);
  assert.doesNotMatch(source, /GITHUB_ENV.*(CLOUDFLARE|OLLAMA|SUPABASE)|(?:CLOUDFLARE|OLLAMA|SUPABASE).*GITHUB_ENV/);
  assert.doesNotMatch(source, /REMOTE.*(OLLAMA|CLOUDFLARE|SUPABASE).*KEY|[A-Z_]+_B64/);
  assert.match(source, /scp "\$local_patch"/);
  assert.match(source, /install -m 600/);
});

test('migrated workflows keep the documented same-repository preview exception as their only custom secret', () => {
  const references = [];
  for (const name of readdirSync(workflowDir).filter((file) => file.endsWith('.yml'))) {
    if (deferredWorkflows.has(name)) continue;
    const source = readWorkflow(name);
    for (const match of source.matchAll(/\$\{\{\s*secrets\.([A-Z0-9_]+)\s*\}\}/g)) {
      references.push({ name, secret: match[1] });
    }
  }

  assert.deepEqual(
    references.filter(({ secret }) => secret !== 'GITHUB_TOKEN'),
    [
      { name: 'build.yml', secret: 'NETLIFY_AUTH_TOKEN' },
      { name: 'build.yml', secret: 'NETLIFY_AUTH_TOKEN' },
    ],
  );
  assert.doesNotMatch(readWorkflow('design-system-package.yml'), /secrets\.GITHUB_TOKEN/);
  assert.match(readWorkflow('design-system-package.yml'), /github\.token/);
});

test('Main UI Audit remains on its existing credentials until separately migrated', () => {
  const source = readWorkflow('main-ui-audit.yml');

  assert.match(source, /secrets\.UI_AUDIT_EMAIL/);
  assert.match(source, /secrets\.UI_AUDIT_PASSWORD/);
  assert.match(source, /secrets\.VITE_SUPABASE_URL/);
  assert.match(source, /secrets\.VITE_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(source, /secrets\.NETLIFY_AUTH_TOKEN/);
  assert.match(source, /secrets\.NETLIFY_SITE_ID/);
  assert.doesNotMatch(source, /google-github-actions\/(auth|get-secretmanager-secrets)/);
});

test('SSH workflows use pinned host keys, Secret Manager keys, and cleanup', () => {
  for (const name of sshWorkflows) {
    const source = readWorkflow(name);
    if (name === 'vps-deploy.yml') {
      assert.match(source, /\.vps\.host_key/);
      assert.match(source, /gcloud secrets versions access latest/);
      assert.match(source, /SSH_KEY_FILE/);
    } else {
      assert.match(source, /TT_PLAYERS_VPS_HOST_KEY/);
      assert.match(source, /steps\.gcp-secrets\.outputs\.vps_ssh_key/);
    }
    assert.doesNotMatch(source, /ssh-keyscan/);
    assert.match(source, /rm -f ~\/\.ssh\/id_ed25519 ~\/\.ssh\/known_hosts/);
    assert.match(source, /gha-creds-\*\.json/);
  }
});

test('runtime secret transfer never uses secret-valued command arguments', () => {
  const deploy = readWorkflow('vps-deploy.yml');
  assert.doesNotMatch(deploy, /REMOTE.*(OLLAMA|CLOUDFLARE|SUPABASE).*KEY|[A-Z_]+_B64/);
  assert.match(deploy, /scp "\$local_patch"/);
  assert.match(deploy, /install -m 600/);

  const backfill = readWorkflow('tournament-entry-form-backfill.yml');
  assert.doesNotMatch(backfill, /base64/);
  assert.doesNotMatch(backfill, /REMOTE.*(OLLAMA|CLOUDFLARE|SUPABASE).*KEY|[A-Z_]+_B64/);
  assert.match(backfill, /scp "\$local_patch"/);
  assert.match(backfill, /install -m 600/);
});

test('credential cleanup exclusions are present', () => {
  assert.match(readFileSync(join(root, '.gitignore'), 'utf8'), /gha-creds-\*\.json/);
  assert.ok(existsSync(join(root, '.dockerignore')));
  assert.match(readFileSync(join(root, '.dockerignore'), 'utf8'), /gha-creds-\*\.json/);
  assert.match(readWorkflow('vps-deploy.yml'), /--exclude 'gha-creds-\*\.json'/);
});
