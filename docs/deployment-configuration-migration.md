# Deployment configuration migration (#227)

This document inventories the GitHub Actions configuration used by TT Players production/operational workflows and records the staged migration to GCP Parameter Manager + Secret Manager.

## Ownership model

| Class | Meaning | Source of truth |
| --- | --- | --- |
| A | Stable bootstrap identity/resource address | Reviewed workflow source |
| B | Ordinary workload configuration | GCP Parameter Manager |
| C | Secret credential | GCP Secret Manager |
| D | Infrastructure topology/policy | `wudong/gcloud` Terraform |
| E | Public compile-time/default application behavior | Repository source |

A workflow must authenticate before it can render Parameter Manager, so GCP project ID, WIF provider resource name, service-account email, and parameter ID are class A rather than GitHub Variables.

## Current workflow input inventory

### Runtime production deploy — `.github/workflows/vps-deploy.yml`

Security boundary: `runtime`.

| Current input | Class | Target |
| --- | --- | --- |
| `vars.TT_PLAYERS_RUNTIME_CONFIG_WIF_PROVIDER` | A | commit `runtime-config` provider resource name |
| `vars.TT_PLAYERS_RUNTIME_SERVICE_ACCOUNT` | A | commit `tt-players-runtime-reader` email |
| `vars.TT_PLAYERS_VPS_HOST` | B | `tt-players-runtime-prod.vps.host` |
| `vars.TT_PLAYERS_VPS_USER` | B | `tt-players-runtime-prod.vps.user` |
| `vars.TT_PLAYERS_VPS_HOST_KEY` | B | `tt-players-runtime-prod.vps.host_key` |
| `vars.VITE_SUPABASE_URL` | B | `tt-players-runtime-prod.api.supabase_url` |
| `vars.VITE_SUPABASE_PUBLISHABLE_KEY` | B | `tt-players-runtime-prod.api.supabase_publishable_key` |
| source constant `https://api.ollama.com` | B | `tt-players-runtime-prod.entry_form_llm.base_url` |
| source constant `deepseek-v4-flash:0731` | B | `tt-players-runtime-prod.entry_form_llm.model` |
| Secret Manager `tt-players-hetzner-vps-deploy-key` | C | named by `secrets.vps_ssh_key_secret_id`; fetched directly by runtime SA |
| Secret Manager `cloudflare-account-id` | C | Parameter Manager `__REF__` |
| Secret Manager `cloudflare-ai-api-token` | C | Parameter Manager `__REF__` |
| Secret Manager `ollama-api-key` | C | Parameter Manager `__REF__` |

The multiline VPS private key is deliberately **not** a Parameter Manager `__REF__`. Parameter Manager substitutes secret bytes into rendered JSON, so a multiline key would make the structured payload invalid. The parameter carries only the reviewed Secret Manager ID; the runtime service account reads that one secret directly.

### SSH operations

Security boundary: `ssh` / parameter `tt-players-ssh-ops`.

Workflows admitted by the SSH provider:

- `.github/workflows/vps-rollback.yml`
- `.github/workflows/vps-ssh-canary.yml`
- `.github/workflows/rating-audit-snapshot.yml`
- `.github/workflows/rating-backtest.yml`
- `.github/workflows/rating-rebuild.yml`
- `.github/workflows/repair-player-aliases.yml`
- `.github/workflows/sport80-competition-match-preview.yml`
- `.github/workflows/tte-calendar-sync.yml`

Their shared GitHub configuration contract is:

| Current input | Class | Target |
| --- | --- | --- |
| `vars.TT_PLAYERS_SSH_WIF_PROVIDER` | A | commit `ssh-ops` provider resource name |
| `vars.TT_PLAYERS_SSH_SERVICE_ACCOUNT` | A | commit `tt-players-ssh-reader` email |
| `vars.TT_PLAYERS_VPS_HOST` | B | `tt-players-ssh-ops.vps.host` |
| `vars.TT_PLAYERS_VPS_USER` | B | `tt-players-ssh-ops.vps.user` |
| `vars.TT_PLAYERS_VPS_HOST_KEY` | B | `tt-players-ssh-ops.vps.host_key` |
| Secret Manager `tt-players-hetzner-vps-deploy-key` | C | named by `secrets.vps_ssh_key_secret_id`; fetched directly by SSH SA |

They must not inherit runtime Cloudflare or Ollama credentials.

### Entry-form backfill — `.github/workflows/tournament-entry-form-backfill.yml`

Security boundary: `backfill` / parameter `tt-players-backfill`.

| Current input | Class | Target |
| --- | --- | --- |
| `vars.TT_PLAYERS_BACKFILL_WIF_PROVIDER` | A | commit `backfill` provider resource name |
| `vars.TT_PLAYERS_BACKFILL_SERVICE_ACCOUNT` | A | commit `tt-players-backfill-reader` email |
| `vars.TT_PLAYERS_VPS_HOST` | B | `tt-players-backfill.vps.host` |
| `vars.TT_PLAYERS_VPS_USER` | B | `tt-players-backfill.vps.user` |
| `vars.TT_PLAYERS_VPS_HOST_KEY` | B | `tt-players-backfill.vps.host_key` |
| source constant `https://api.ollama.com` | B | `tt-players-backfill.entry_form_llm.base_url` |
| source constant `deepseek-v4-flash:0731` | B | `tt-players-backfill.entry_form_llm.model` |
| Secret Manager `tt-players-hetzner-vps-deploy-key` | C | named by `secrets.vps_ssh_key_secret_id`; fetched directly by backfill SA |
| Secret Manager `ollama-api-key` | C | Parameter Manager `__REF__` |

The backfill parameter must not resolve Cloudflare credentials.

### VETTS results backfill — `.github/workflows/vetts-results-backfill.yml`

This workflow currently uses `vars.TT_PLAYERS_BACKFILL_WIF_PROVIDER` and `vars.TT_PLAYERS_BACKFILL_SERVICE_ACCOUNT`, plus `TT_PLAYERS_VPS_HOST`, `TT_PLAYERS_VPS_USER`, `TT_PLAYERS_VPS_HOST_KEY`, and only the VPS deploy-key secret. That is a boundary mismatch: the Terraform backfill provider admits only `tournament-entry-form-backfill.yml`, and VETTS does not need Ollama access.

During cutover, move VETTS to the least-privilege SSH operations identity rather than widening the backfill provider.

### Frontend build and deployment — `.github/workflows/build.yml`

Security boundary: `frontend` for production deployment; unprivileged build and same-repository preview remain separate.

| Current input | Class | Target |
| --- | --- | --- |
| `vars.VITE_SUPABASE_URL` | E | reviewed public frontend config in source |
| `vars.VITE_SUPABASE_PUBLISHABLE_KEY` | E | reviewed public frontend config in source |
| `vars.NETLIFY_SITE_ID` | E | reviewed deployment/site config in source |
| `vars.TT_PLAYERS_FRONTEND_WIF_PROVIDER` | A | commit `frontend` provider resource name |
| `vars.TT_PLAYERS_FRONTEND_SERVICE_ACCOUNT` | A | commit `tt-players-frontend-reader` email |
| Secret Manager `tt-players-netlify-auth-token` | C | direct production frontend SA access |
| `secrets.NETLIFY_AUTH_TOKEN` | C | retain only for same-repository PR preview exception |

Fork PRs receive no Netlify credential. No frontend Parameter Manager document is needed.

### Main UI audit — `.github/workflows/main-ui-audit.yml`

Security boundary: `ui_audit`.

Current GitHub Secrets used directly are:

- `secrets.VITE_SUPABASE_URL`
- `secrets.VITE_SUPABASE_PUBLISHABLE_KEY`
- `secrets.UI_AUDIT_EMAIL`
- `secrets.UI_AUDIT_PASSWORD`
- `secrets.NETLIFY_AUTH_TOKEN`
- `secrets.NETLIFY_SITE_ID`

The Supabase URL/publishable key and Netlify site ID are not credentials and should move to reviewed source. Synthetic audit email/password and Netlify auth remain class C and should be read through the already-provisioned `ui_audit` WIF identity from Secret Manager. No Parameter Manager document is required unless meaningful non-secret audit configuration is introduced later.

## Parameter boundaries

GCP Terraform provisions exactly these structured JSON parameters:

- `tt-players-runtime-prod`
- `tt-players-ssh-ops`
- `tt-players-backfill`

Each carries `schema_version: 1`. Terraform parameter data contains ordinary configuration, JSON-safe Secret Manager `__REF__` placeholders, and non-secret Secret Manager IDs for multiline SSH keys. It contains no raw secret values.

Frontend and UI audit intentionally have no parameter document because their remaining privileged inputs are secret-only.

## Staged rollout

### Stage 1 — provision only

Infrastructure PR #44 created the three parameter definitions and reader IAM. Follow-up gcloud PR #45 removes the temporary shadow identity and admits the exact shadow workflow through the existing `runtime-config` provider instead.

After #45 merges, run the manual Terraform workflow against `main` with **plan only** first. Review the real remote-state plan, then apply. No TT Players production workflow changes source of truth during Stage 1.

### Stage 2 — runtime-identity shadow compare

This PR adds `.github/workflows/parameter-manager-shadow.yml`.

After the GCP infrastructure is applied, merge this PR and run **Validate Parameter Manager Shadow Config** manually from `main`. It:

1. authenticates through `runtime-config` as the production `tt-players-runtime-reader`;
2. installs the Cloud SDK explicitly;
3. renders `tt-players-runtime-prod` using `--format="value(renderedPayload)" | base64 -d` into a mode-0600 temporary file;
4. validates `schema_version` and the expected object shape;
5. compares non-secret values against the existing production GitHub Variables/source constants without printing either copy;
6. verifies Cloudflare/Ollama Parameter Manager secret references resolve non-empty without printing contents;
7. verifies `secrets.vps_ssh_key_secret_id` matches the reviewed SSH secret ID and proves the production runtime SA can read that Secret Manager secret into a protected temporary file;
8. deletes rendered config, the temporary SSH key, and generated Google credentials in `if: always()` cleanup.

The workflow is non-mutating. Its successful run proves the same runtime identity used by production has both Parameter Manager render access and the required direct multiline-secret access.

### Stage 3 — production cutover

Only after Stage 2 succeeds on production `main`:

- commit stable bootstrap coordinates for each workload;
- render the matching parameter from production/operational workflows;
- fetch multiline VPS private keys directly from the exact Secret Manager secret ID named by each parameter;
- stop reading migrated ordinary config from GitHub Variables;
- preserve pinned SSH verification, mode-0600 files, DB compatibility/fingerprint logic, forward-only migration boundary, versioned releases, health checks, and rollback semantics;
- move public frontend compile-time values and non-secret site IDs to reviewed source;
- wire UI audit to its dedicated direct Secret Manager identity;
- move VETTS backfill to the least-privilege SSH admission rather than broadening backfill.

### Stage 4 — cleanup

Only after a successful production deploy and health verification:

- delete obsolete repository Variables and duplicate repository Secrets;
- remove transitional comparison code;
- remove direct Secret Manager IAM only where Parameter Manager now resolves the secret and no direct access is required;
- retain direct secret-scoped access for multiline VPS keys and secret-only frontend/UI-audit boundaries;
- retain the narrow same-repository Netlify preview exception;
- update `docs/deployment.md` and `AGENTS.md` to describe the final steady state.

## Verification gate

Do not mark #227 complete until all of the following have happened on production `main`:

- GCP infrastructure plan reviewed and applied;
- runtime-identity shadow comparison passed;
- runtime Parameter Manager render passed;
- direct VPS SSH-key Secret Manager read passed;
- pinned SSH verification passed;
- backend quality gate passed;
- DB compatibility boundary remained correct;
- versioned release activated;
- `/api/health` and `/api/health/db` passed;
- worker received Cloudflare/Ollama configuration from the new source;
- API received expected Supabase config;
- rollback/manual SSH workflows still work with least privilege;
- VETTS no longer relies on the entry-form backfill boundary;
- obsolete GitHub config and transitional migration code were removed;
- no unrelated workflow gained additional secret access.
