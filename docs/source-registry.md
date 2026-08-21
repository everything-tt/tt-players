# Source registry and adapter contract

The source registry separates an upstream provider from each concrete tenant and resource that TT Players ingests.

## Model

- `platforms` identifies the provider family, such as TT Leagues, TableTennis365, or Sport:80.
- `source_instances` identifies a concrete upstream tenant or governing-body installation, such as a district league site.
- `source_resources` identifies one independently refreshed upstream resource, such as a standings table, fixture list, event result table, or ranking list.

Each resource records its adapter version, refresh policy, canonical league/season/competition links, latest successful processing timestamps, and consecutive failures. This makes ingestion coverage and health queryable instead of leaving it only in JSON configuration or logs.

## Discovery status and resource lifecycle

Tenant discovery state and resource scheduling lifecycle are deliberately separate concepts.

`source_instances.discovery_status` records the result of the latest bounded discovery attempt:

- `healthy` — discovery completed with a usable active catalogue;
- `no_active_competition` — discovery completed successfully but no safe active competition was present;
- `ambiguous` — multiple plausible candidates require operator review;
- `failed` — the provider request, response shape, or discovery process failed.

`last_discovery_at`, `last_discovery_error`, and `discovery_metadata` keep the operational evidence for that decision. A failed or empty discovery attempt must not by itself delete or disable previously known resources.

`source_resources.lifecycle` controls how a discovered resource participates in ingestion:

- `candidate` — discovered but not yet validated for activation;
- `active` — eligible for the normal ingestion schedule/barrier;
- `historical` — retained for query/backfill but outside the active daily lifecycle;
- `blocked_pending_review` — visible operationally but not safe to activate automatically.

The existing `enabled` flag remains an administrative/operational switch. It must not be used as a substitute for lifecycle state.

## Adapter contract

Adapters implement two explicit stages:

1. `extract(context)` fetches and returns the source payload.
2. `transform(rawPayload, context)` validates and converts that payload into a normalized adapter result.

Every adapter publishes a manifest containing a stable key, version, display name, and the resource types it supports. `defineSourceAdapter` validates the manifest when the adapter is constructed.

The existing TT Leagues, TableTennis365, and Sport:80 pipelines can migrate to this contract incrementally. This foundation does not change their current scheduling or parsing behavior.

## Registry lifecycle

Worker code should use the registry helpers to:

- upsert a source instance when discovering or bootstrapping a tenant;
- record the tenant discovery outcome without mutating known-good resources on failure;
- upsert each refreshable resource using `(instance, resource type, external ID)` as its stable identity;
- assign resource lifecycle separately from the administrative `enabled` flag;
- record success after extraction and parsing complete;
- record failure with a bounded error message and incremented failure count.

A later operational API can read these tables to expose coverage, freshness, discovery state, parser versions, lifecycle, and failing sources.
