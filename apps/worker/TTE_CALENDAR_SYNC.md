# TTE calendar sync

The production calendar sync is executed by `.github/workflows/tte-calendar-sync.yml`.

The workflow invokes `src/scrape-tte-events-once.ts` from the currently active VPS release through a transient systemd unit. The unit reads `/etc/ttp/worker.env` and runs as the existing `ttp:ttp` service account.

Run order:

1. Deploy backend changes through `Deploy API and Database to VPS`.
2. Confirm the production release contains `apps/worker/src/scrape-tte-events-once.ts`.
3. Manually run `Sync TTE Tournament Calendar`, or allow the daily schedule to run.
4. The workflow validates both upcoming and completed event API queries after the scrape.

The calendar workflow intentionally has no push trigger, so it cannot race a production deployment.