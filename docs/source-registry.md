# Source registry and adapter contract

The source registry separates an upstream provider from each concrete tenant and resource that TT Players ingests.

## Model

- `platforms` identifies the provider family, such as TT Leagues, TableTennis365, or Sport:80.
- `source_instances` identifies a concrete upstream tenant or governing-body installation, such as a district league site.
- `source_resources` identifies one independently refreshed upstream resource, such as a standings table, fixture list, event result table, or ranking list.

Each resource records its adapter version, refresh policy, canonical league/season/competition links, latest successful processing timestamps, and consecutive failures. This makes ingestion coverage and health queryable instead of leaving it only in JSON configuration or logs.

## Adapter contract

Adapters implement two explicit stages:

1. `extract(context)` fetches and returns the source payload.
2. `transform(rawPayload, context)` validates and converts that payload into a normalized adapter result.

Every adapter publishes a manifest containing a stable key, version, display name, and the resource types it supports. `defineSourceAdapter` validates the manifest when the adapter is constructed.

The existing TT Leagues, TableTennis365, and Sport:80 pipelines can migrate to this contract incrementally. This foundation does not change their current scheduling or parsing behavior.

## Registry lifecycle

Worker code should use the registry helpers to:

- upsert a source instance when discovering or bootstrapping a tenant;
- upsert each refreshable resource using `(instance, resource type, external ID)` as its stable identity;
- record success after extraction and parsing complete;
- record failure with a bounded error message and incremented failure count.

A later operational API can read these tables to expose coverage, freshness, parser versions, and failing sources.
