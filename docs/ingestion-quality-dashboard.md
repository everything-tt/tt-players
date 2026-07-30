# Ingestion quality dashboard

The Data Coverage page exposes a read-only operational view of TT Players data ingestion.

## Metrics

The report combines existing normalized data with the source registry:

- providers, leagues, competitions, fixtures and rubbers;
- canonical players compared with source-specific player profiles;
- percentage of rubbers with a usable match date;
- percentage of rubbers with full game scores rather than win/loss-only data;
- rubbers missing a singles player;
- pending identity suggestions;
- stored scrape payloads and historical transform failures;
- registered source instances and resources;
- resources with consecutive failures, latest activity and latest error.

## Health states

- `healthy`: activity has been observed and no registered resource currently has consecutive failures.
- `degraded`: at least one enabled registered resource has consecutive failures.
- `unobserved`: no scrape or registry activity has been recorded yet.

Historical scrape failures remain visible as an audit metric but do not by themselves mark a provider degraded.

## API and UI

- API: `GET /api/sources/quality`
- UI: `/data-coverage`, linked from the About page

The API response is cacheable for five minutes. It contains only operational aggregate data and public provider URLs; it does not expose raw payloads or private user data.
