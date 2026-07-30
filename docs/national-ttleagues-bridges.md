# National TT Leagues bridge sources

TT Players ingests two national competition tenants that connect players across otherwise separate local leagues:

- British Clubs Leagues: `https://british.ttleagues.com`
- County Championships: `https://countychampionships.ttleagues.com`

## Runtime discovery

Competition and division IDs are not stored in configuration. On worker startup, each tenant is queried through the shared TT Leagues API using its required `Tenant` and `Entry` headers.

The worker discovers:

- every currently active upstream competition;
- every division inside each active competition; and
- when history mode is enabled, a bounded number of archived competitions.

This avoids guessed IDs and automatically follows new seasons and categories.

## Canonical model

Each tenant is one TT Players league and one source-registry instance.

All currently active upstream competitions are grouped under one synthetic active season named `Current national competitions`. Canonical division keys combine the upstream competition and division IDs, and display names retain both names.

When an upstream competition becomes archived, its existing canonical division rows move to the historical season. Fixtures and rubbers therefore keep their IDs and are not duplicated during the transition.

## Scheduling and failure isolation

National targets join the existing configured local-league targets for scheduled and one-off scraping. Both standings and match jobs carry the tenant host.

Each national tenant is discovered independently. If one tenant is unavailable, it is logged and skipped without preventing local leagues or the other national tenant from starting.

Historical national targets follow the existing history cooldown policy. Active targets run on the normal daily scrape schedule.

## Source registry

For every tenant, the bootstrap creates:

- one `source_instances` row;
- a standings resource for each discovered division; and
- a fixtures resource for each discovered division.

Resources record adapter version, current or historical refresh policy, and their canonical league, season and competition links. Stale current resources are disabled until the corresponding competition is rediscovered or moved into history.
