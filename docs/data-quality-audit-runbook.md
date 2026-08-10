# TT Players Scraping & Production Data Quality Audit Runbook

## 1. Purpose

This runbook defines how an engineering agent should evaluate:

1. Scraping pipeline health.
2. Parser/loader correctness.
3. Production database integrity.
4. Cross-source deduplication quality.
5. Player identity resolution quality.
6. Source coverage and freshness.
7. Regressions introduced by scraper changes.
8. Opportunities to improve scraping and reconciliation logic.

The intended feedback loop is:

```text
Production scrape
      ↓
Raw source data
      ↓
Parse / transform
      ↓
Normalized database
      ↓
Dedup / reconciliation
      ↓
Quality audit
      ↓
Findings
      ↓
Parser / scraper / reconciliation improvement
      ↓
Regression tests / golden corpus
      ↓
Deploy
      ↓
Audit again
```

---

## 2. Safety Rules

The audit is **read-only by default**.

The agent MUST NOT:

- delete production rows;
- manually merge players;
- change `canonical_player_id`;
- soft-delete suspected duplicate rubbers;
- reprocess production payloads;
- reset Graphile jobs;
- modify source-resource state;
- update scraper configuration;
- deploy code;
- alter database constraints;

unless explicitly instructed to do so.

The agent MAY:

- inspect repository code;
- inspect migrations;
- run SELECT queries against production;
- inspect API monitoring endpoints;
- compare metrics;
- identify suspicious records;
- create reports;
- create GitHub issues;
- propose code changes;
- add tests in a development branch when explicitly asked.

When evidence is uncertain, classify the item for review rather than modifying data.

---

## 3. System Model

Treat these concepts separately.

### 3.1 Source identity

A row in:

```text
external_players
```

represents a source-specific player/profile.

It is not necessarily a unique real-world person.

### 3.2 Canonical identity

```text
external_players.canonical_player_id
```

groups source profiles believed to represent the same real-world player.

Expected invariant:

```text
source player → canonical root
canonical root → itself
```

Example:

```text
TT365 Grace Liu      → player A
TTLeagues Grace Liu → player A
player A             → player A
```

Rubber player references should retain the **source-specific** player ID.

Do not assume rubber player IDs are canonical IDs.

### 3.3 Source result vs canonical result

Some imported event/result data is preserved in staging and linked to an existing canonical rubber.

For example:

```text
staging.source_event_result_rows
        ↓ canonical_rubber_id
rubbers
```

This relationship is used for cross-source result deduplication.

### 3.4 Raw scrape payloads

```text
staging.raw_scrape_logs
```

stores unique versions of source responses.

Identity is effectively:

```text
(endpoint_url, payload_hash)
```

An unchanged source response updates the existing log rather than creating a new history row.

Therefore:

> `raw_scrape_logs` must NOT be interpreted as a complete history of HTTP scrape attempts.

---

## 4. Audit Modes

The agent should support three modes.

### Mode A — Daily health audit

Goal:

> Determine whether the current production data pipeline is healthy.

Run:

- scraper health;
- queue health;
- failed transformations;
- source freshness;
- structural database invariants;
- current data-quality metrics.

Expected duration: lightweight.

### Mode B — Full data-quality audit

Goal:

> Identify incorrect, incomplete, duplicate or suspicious production data.

Run all Daily Health checks plus:

- player identity checks;
- result duplicate checks;
- coverage checks;
- score completeness checks;
- suspicious normalized records;
- cross-source reconciliation analysis.

### Mode C — Scraper change evaluation

Goal:

> Determine whether a proposed scraper/parser change improves or degrades production-data quality.

Perform:

```text
baseline audit
↓
run new parser against representative stored payloads
↓
compare normalized output
↓
run audit against output
↓
report deltas
```

Never judge scraper changes purely by unit-test success.

---

## 5. Audit Output Format

Every audit must produce a report containing:

```text
Audit date:
Environment:
Database:
Git commit:
Audit mode:

Overall status:
PASS / WARNING / FAIL

Summary:
- critical findings
- errors
- warnings
- informational findings

Metrics:
...

Findings:
...

Recommended actions:
...

Regression candidates:
...

Suggested scraper improvements:
...
```

Every finding must include:

```text
check_id
severity
description
count
sample IDs / URLs
probable cause
recommended next investigation
```

Severities:

### CRITICAL

A core data invariant is violated.

Examples:

- one source player confirmed against multiple canonical players;
- broken canonical-player chain;
- confirmed identity decision not reflected in `external_players`;
- foreign/provenance relationship is internally contradictory.

### ERROR

Production data is probably incorrect or ingestion is malfunctioning.

Examples:

- completed fixtures with zero rubbers;
- active source repeatedly failing;
- stale active-season resources;
- malformed normal match scores.

### WARNING

Data is suspicious and should be reviewed.

Examples:

- probable duplicate rubbers;
- unresolved player matches;
- significant payload-size change;
- unusual drop in source coverage.

### INFO

Useful trend or improvement opportunity.

---

## 6. Phase 1 — Inspect Current Pipeline Health

### CHECK PIPELINE-01 — Graphile ingestion failures

Inspect Graphile Worker jobs for scraping-related tasks.

Relevant task identifiers include:

```text
scrapeUrlTask
processLogTask
scrapeMatchesTask
scrapeMatchSetsBatchTask
processMatchSetsBatchTask
scrapeSport80EventsTask
scrapeSport80EventResultsTask
scrapeSport80RankingsDiscoveryTask
scrapeSport80RankingTableTask
completeDailyPipelineTask
```

Collect:

- running;
- ready;
- scheduled;
- exhausted/failed;
- oldest pending job;
- latest error per task.

#### Pass criteria

```text
permanently_failed_ingestion_jobs = 0
```

A small number of actively running or scheduled jobs is normal.

#### Failure action

For each failed job determine:

```text
platform
resource
HTTP status/error
transient vs permanent
first failure
latest failure
number of attempts
```

Do not reset jobs during the audit.

---

## 7. Phase 2 — Raw Scrape Health

### CHECK SCRAPE-01 — Failed or stale transformations

```sql
SELECT
    p.name AS platform,
    l.status,
    COUNT(*) AS count,
    MIN(l.scraped_at) AS oldest,
    MAX(l.scraped_at) AS newest
FROM staging.raw_scrape_logs l
JOIN platforms p ON p.id = l.platform_id
WHERE
      l.status = 'failed'
   OR (
       l.status = 'pending'
       AND l.updated_at < now() - interval '2 hours'
   )
GROUP BY p.name, l.status
ORDER BY count DESC;
```

#### Pass criteria

No stale pending logs.

Investigate failed rows, especially recent ones.

#### Record

For failures collect a small sample of:

```text
raw_scrape_log.id
platform
endpoint_url
payload_hash
scraped_at
```

---

## 8. Phase 3 — Source Registry Health

### CHECK SOURCE-01 — Failing or stale active resources

```sql
SELECT
    p.name AS platform,
    si.name AS source_instance,
    sr.resource_type,
    sr.external_id,
    sr.name,
    sr.public_url,
    sr.last_fetched_at,
    sr.last_succeeded_at,
    sr.last_parsed_at,
    sr.consecutive_failures,
    sr.last_error
FROM source_resources sr
JOIN source_instances si
  ON si.id = sr.source_instance_id
JOIN platforms p
  ON p.id = si.platform_id
LEFT JOIN seasons s
  ON s.id = sr.season_id
WHERE sr.enabled
  AND si.enabled
  AND (
       sr.consecutive_failures > 0
       OR (
          COALESCE(s.is_active, false)
          AND (
              sr.last_succeeded_at IS NULL
              OR sr.last_succeeded_at < now() - interval '36 hours'
          )
       )
  )
ORDER BY
    sr.consecutive_failures DESC,
    sr.last_succeeded_at NULLS FIRST;
```

#### Classification

```text
consecutive_failures >= 3 → ERROR
active resource >36h stale → ERROR
single recent transient failure → WARNING
```

Check whether failures cluster by:

```text
platform
adapter
resource type
domain
HTTP status
```

Clusters usually indicate framework/parser/source breakage rather than isolated data problems.

---

## 9. Phase 4 — Core Normalized Data Checks

### CHECK DATA-01 — Completed fixtures without rubbers

```sql
SELECT
    p.name AS platform,
    l.name AS league,
    s.name AS season,
    c.name AS competition,
    f.id,
    f.external_id,
    f.date_played,
    f.updated_at
FROM fixtures f
JOIN competitions c ON c.id = f.competition_id
JOIN seasons s ON s.id = c.season_id
JOIN leagues l ON l.id = s.league_id
JOIN platforms p ON p.id = l.platform_id
LEFT JOIN rubbers r
       ON r.fixture_id = f.id
      AND r.deleted_at IS NULL
WHERE f.deleted_at IS NULL
  AND f.status = 'completed'
GROUP BY
    p.name,
    l.name,
    s.name,
    c.name,
    f.id,
    f.external_id,
    f.date_played,
    f.updated_at
HAVING COUNT(r.id) = 0
ORDER BY f.date_played DESC;
```

#### Interpretation

Possible causes:

```text
fixture discovery worked
BUT
match-card/result parsing failed
```

or:

```text
source marks fixture completed
BUT result is not yet published
```

#### Classification

Recent fixture:

```text
WARNING
```

Older fixture:

```text
ERROR
```

Review several samples before concluding the parser is broken.

---

## 10. CHECK DATA-02 — Malformed rubbers

```sql
SELECT
    r.id,
    r.external_id,
    r.fixture_id,
    r.is_doubles,
    r.home_player_1_id,
    r.home_player_2_id,
    r.away_player_1_id,
    r.away_player_2_id,
    r.home_games_won,
    r.away_games_won,
    r.outcome_type,
    r.score_source
FROM rubbers r
WHERE r.deleted_at IS NULL
  AND (
       r.home_player_1_id IS NULL
    OR r.away_player_1_id IS NULL
    OR (
        r.is_doubles
        AND (
            r.home_player_2_id IS NULL
            OR r.away_player_2_id IS NULL
        )
    )
    OR r.home_games_won < 0
    OR r.away_games_won < 0
    OR (
        r.outcome_type = 'normal'
        AND r.home_games_won = r.away_games_won
    )
  );
```

Do not automatically assume all returned records are bugs.

Inspect source-specific edge cases such as:

```text
walkovers
retirements
incomplete score sources
legacy data
unregistered players
```

#### Classification

Clearly impossible normal result:

```text
ERROR
```

Legitimate source limitation:

```text
WARNING / INFO
```

---

## 11. CHECK DATA-03 — Missing player rate

Measure globally and per platform.

```sql
SELECT
    p.name AS platform,
    COUNT(r.id) AS rubbers,
    COUNT(r.id) FILTER (
        WHERE r.home_player_1_id IS NULL
           OR r.away_player_1_id IS NULL
    ) AS missing_players,
    ROUND(
        100.0 *
        COUNT(r.id) FILTER (
            WHERE r.home_player_1_id IS NULL
               OR r.away_player_1_id IS NULL
        ) /
        NULLIF(COUNT(r.id), 0),
        2
    ) AS missing_pct
FROM platforms p
JOIN leagues l
  ON l.platform_id = p.id
JOIN seasons s
  ON s.league_id = l.id
JOIN competitions c
  ON c.season_id = s.id
JOIN fixtures f
  ON f.competition_id = c.id
JOIN rubbers r
  ON r.fixture_id = f.id
WHERE r.deleted_at IS NULL
GROUP BY p.id, p.name
ORDER BY missing_pct DESC;
```

Compare with previous audits.

A sudden increase matters more than a static small percentage.

---

## 12. CHECK DATA-04 — Score completeness

Use:

```text
score_source = 'games'
```

as the strongest score-quality indicator where applicable.

Track:

```text
full_score_rubbers / all rubbers
```

by:

```text
platform
league
season
competition
```

Flag significant degradation compared with previous successful runs.

---

### CHECK DATA-05 — Active rubbers on non-completed fixtures

An active rubber must belong to a completed fixture before it can affect
ratings. The `rating_rubber_classification` view enforces this boundary with
the `fixture_not_completed` exclusion reason.

Run:

```sql
SELECT
    p.name AS platform,
    f.status AS fixture_status,
    COUNT(DISTINCT f.id) AS affected_fixtures,
    COUNT(r.id) AS active_rubbers,
    COUNT(r.id) FILTER (
        WHERE classification.eligibility_reason = 'fixture_not_completed'
    ) AS rating_excluded_rubbers,
    COUNT(r.id) FILTER (
        WHERE classification.eligibility_reason = 'eligible'
    ) AS incorrectly_rating_eligible_rubbers,
    MIN(COALESCE(r.played_at::date, f.date_played)) AS earliest_effective_date,
    MAX(COALESCE(r.played_at::date, f.date_played)) AS latest_effective_date
FROM fixtures f
JOIN competitions c
  ON c.id = f.competition_id
JOIN seasons s
  ON s.id = c.season_id
JOIN leagues l
  ON l.id = s.league_id
JOIN platforms p
  ON p.id = l.platform_id
JOIN rubbers r
  ON r.fixture_id = f.id
 AND r.deleted_at IS NULL
LEFT JOIN rating_rubber_classification classification
  ON classification.rubber_id = r.id
WHERE f.deleted_at IS NULL
  AND f.status <> 'completed'
GROUP BY p.id, p.name, f.status
ORDER BY p.name, f.status;
```

#### Interpretation

Expected:

```text
no active rubbers on upcoming or postponed fixtures
incorrectly_rating_eligible_rubbers = 0
```

Classify any `incorrectly_rating_eligible_rubbers > 0` as **CRITICAL** because
the rating eligibility gate has regressed. Classify active rubbers that are
correctly excluded from ratings as **ERROR** because normalized fixture/result
state is inconsistent even though ratings are protected.

For each affected fixture, inspect the latest raw source payload before taking
corrective action. A successfully re-fetched non-completed fixture should have
its stale rubbers reconciled or soft-deleted. Do not mutate production data as
part of the audit itself.

---

## 13. Phase 5 — Player Identity Integrity

### CHECK IDENTITY-01 — Broken canonical topology

Expected:

```text
alias → root
root → root
```

Run:

```sql
SELECT
    p.id AS player_id,
    p.name,
    p.platform_id,
    p.canonical_player_id,
    root.id AS root_id,
    root.name AS root_name,
    root.deleted_at AS root_deleted_at,
    root.canonical_player_id AS root_points_to
FROM external_players p
JOIN external_players root
  ON root.id = p.canonical_player_id
WHERE p.deleted_at IS NULL
  AND (
       root.deleted_at IS NOT NULL
       OR root.canonical_player_id IS DISTINCT FROM root.id
  );
```

#### Pass criteria

```text
0 rows
```

#### Severity

```text
CRITICAL
```

---

## 14. CHECK IDENTITY-02 — Multiple confirmed identities

```sql
SELECT
    source_player_id,
    COUNT(*) AS confirmed_links,
    ARRAY_AGG(canonical_player_id) AS canonical_ids
FROM player_identity_decisions
WHERE status = 'confirmed'
GROUP BY source_player_id
HAVING COUNT(DISTINCT canonical_player_id) > 1;
```

#### Pass criteria

```text
0 rows
```

#### Severity

```text
CRITICAL
```

If this ever returns records, recommend adding:

```sql
CREATE UNIQUE INDEX uq_player_identity_one_confirmed
ON player_identity_decisions(source_player_id)
WHERE status = 'confirmed';
```

Do not create the index during an audit unless explicitly requested.

---

## 15. CHECK IDENTITY-03 — Confirmed decisions not applied

```sql
SELECT
    d.id AS decision_id,
    d.source_player_id,
    d.canonical_player_id AS expected,
    ep.canonical_player_id AS actual
FROM player_identity_decisions d
JOIN external_players ep
  ON ep.id = d.source_player_id
WHERE d.status = 'confirmed'
  AND ep.canonical_player_id IS DISTINCT
      FROM d.canonical_player_id;
```

#### Pass criteria

```text
0 rows
```

#### Severity

```text
CRITICAL
```

This indicates reconciliation/application logic has become inconsistent.

---

## 16. CHECK IDENTITY-04 — Review backlog

```sql
SELECT
    status,
    COUNT(*)
FROM player_identity_decisions
GROUP BY status
ORDER BY status;
```

Report:

```text
suggested
confirmed
rejected
```

Also calculate age of oldest suggestion.

A growing suggestion backlog is not a correctness failure, but indicates canonical player quality may stop improving.

---

## 17. CHECK IDENTITY-05 — Potential matches missed by current algorithm

Current automatic matching is intentionally conservative.

Use a more aggressive audit-only normalization:

```sql
WITH names AS (
    SELECT
        regexp_replace(
            lower(trim(name)),
            '[^a-z0-9]+',
            '',
            'g'
        ) AS normalized_name,

        COUNT(*) AS source_profiles,

        COUNT(DISTINCT platform_id)
            AS platforms,

        COUNT(
            DISTINCT COALESCE(
                canonical_player_id,
                id
            )
        ) AS canonical_people,

        ARRAY_AGG(
            jsonb_build_object(
                'id', id,
                'name', name,
                'platform_id', platform_id,
                'external_id', external_id,
                'canonical_player_id',
                    canonical_player_id
            )
        ) AS players

    FROM external_players

    WHERE deleted_at IS NULL
      AND external_id IS NOT NULL

    GROUP BY 1
)

SELECT *
FROM names

WHERE platforms > 1
  AND canonical_people > 1

ORDER BY source_profiles DESC;
```

#### Important

These are **candidates**, not confirmed duplicates.

Never auto-merge them.

Use findings to improve identity evidence such as:

```text
governing-body player ID
club
county
competition history
age category
rating history
source profile URLs
```

---

## 18. Phase 6 — Cross-Source Result Deduplication

### CHECK DEDUP-01 — Probable duplicate rubbers

```sql
WITH normalized AS (
    SELECT
        r.id,
        r.external_id,
        f.competition_id,

        COALESCE(
            r.played_at::date,
            f.date_played
        ) AS played_date,

        LEAST(
            COALESCE(h.canonical_player_id, h.id)::text,
            COALESCE(a.canonical_player_id, a.id)::text
        ) AS player_1,

        GREATEST(
            COALESCE(h.canonical_player_id, h.id)::text,
            COALESCE(a.canonical_player_id, a.id)::text
        ) AS player_2,

        CASE
          WHEN r.home_games_won > r.away_games_won
          THEN COALESCE(h.canonical_player_id, h.id)
          ELSE COALESCE(a.canonical_player_id, a.id)
        END AS winner,

        GREATEST(
            r.home_games_won,
            r.away_games_won
        ) AS winner_games,

        LEAST(
            r.home_games_won,
            r.away_games_won
        ) AS loser_games,

        r.outcome_type

    FROM rubbers r

    JOIN fixtures f
      ON f.id = r.fixture_id

    JOIN external_players h
      ON h.id = r.home_player_1_id

    JOIN external_players a
      ON a.id = r.away_player_1_id

    WHERE r.deleted_at IS NULL
      AND r.is_doubles = false
)

SELECT
    competition_id,
    played_date,
    player_1,
    player_2,
    winner,
    winner_games,
    loser_games,
    outcome_type,
    COUNT(*) AS possible_duplicates,
    ARRAY_AGG(id) AS rubber_ids,
    ARRAY_AGG(external_id) AS external_ids

FROM normalized

GROUP BY
    competition_id,
    played_date,
    player_1,
    player_2,
    winner,
    winner_games,
    loser_games,
    outcome_type

HAVING COUNT(*) > 1

ORDER BY possible_duplicates DESC;
```

#### Severity

Default:

```text
WARNING
```

Do not automatically remove duplicates.

Two players can genuinely meet more than once on the same day.

For each candidate inspect:

```text
source
competition
round
fixture
timestamp
source event
external ID
source URL
```

---

## 19. CHECK DEDUP-02 — VETTS/source reconciliation status

```sql
SELECT
    sr.source,

    COUNT(*) AS rows,

    COUNT(*) FILTER (
        WHERE sr.canonical_rubber_id IS NULL
    ) AS unlinked,

    COUNT(*) FILTER (
        WHERE sr.raw_payload -> 'duplicateReview'
              IS NOT NULL
    ) AS duplicate_conflicts,

    COUNT(*) FILTER (
        WHERE r.deleted_at IS NOT NULL
    ) AS linked_to_deleted_rubber

FROM staging.source_event_result_rows sr

LEFT JOIN rubbers r
  ON r.id = sr.canonical_rubber_id

GROUP BY sr.source;
```

Track ratios:

```text
linked %
unlinked %
conflict %
invalid-link %
```

#### Important

Trend these metrics.

Example:

```text
VETTS duplicate conflict rate

last month: 1.1%
today:      9.8%
```

should trigger investigation even if no invariant is technically violated.

---

## 20. Phase 7 — Payload Drift Detection

### CHECK SCRAPER-DRIFT-01 — Unexpected payload-size changes

A source may return HTTP 200 while actually returning:

```text
login page
Cloudflare page
error HTML
changed page layout
empty JSON
anti-bot response
```

Run:

```sql
WITH payloads AS (
    SELECT
        endpoint_url,
        scraped_at,
        octet_length(raw_payload) AS bytes,

        ROW_NUMBER() OVER (
            PARTITION BY endpoint_url
            ORDER BY scraped_at DESC
        ) AS rn

    FROM staging.raw_scrape_logs

    WHERE scraped_at >
          now() - interval '30 days'
),

baseline AS (
    SELECT
        endpoint_url,

        percentile_cont(0.5)
        WITHIN GROUP (ORDER BY bytes)
            AS median_bytes

    FROM payloads

    WHERE rn > 1

    GROUP BY endpoint_url
)

SELECT
    p.endpoint_url,
    p.bytes AS latest_bytes,
    b.median_bytes,

    ROUND(
        (p.bytes / NULLIF(b.median_bytes, 0))::numeric,
        2
    ) AS ratio

FROM payloads p

JOIN baseline b
  USING (endpoint_url)

WHERE p.rn = 1

  AND (
       p.bytes < b.median_bytes * 0.25
       OR
       p.bytes > b.median_bytes * 4
  )

ORDER BY ratio;
```

#### Severity

```text
WARNING
```

Upgrade to ERROR if samples reveal malformed source responses.

---

## 21. Phase 8 — Coverage Comparison

For every active platform calculate:

```text
leagues
competitions
fixtures
rubbers
players
canonical players
dated rubber %
full-score %
missing-player %
resource count
unhealthy resource count
latest source activity
```

Compare against:

```text
previous audit
7-day baseline
30-day baseline
```

Focus on **unexpected decreases**.

Examples:

```text
TT365 rubbers:
yesterday 183,220
today      181,940
```

A decrease may indicate:

```text
soft deletion bug
resource discovery regression
season configuration problem
incorrect dedup
```

Likewise:

```text
active TTLeagues competitions:
yesterday 311
today      247
```

should be investigated.

---

## 22. Phase 9 — Diagnose Findings

For every ERROR or CRITICAL finding, classify the failure layer.

Use:

```text
SOURCE
EXTRACT
RAW STORAGE
PARSER
LOADER
NORMALIZATION
IDENTITY
RESULT DEDUP
READ MODEL
RATING
UNKNOWN
```

Examples:

### Source problem

Source itself contains wrong or unavailable data.

Action:

```text
do not fix parser
record upstream limitation
```

### Extract problem

HTTP fetch failed or received unexpected content.

Investigate:

```text
HTTP policy
cookies
CSRF
anti-bot
URL discovery
rate limits
```

### Parser problem

Raw source is correct but parsed output is incomplete/wrong.

This should normally produce:

```text
parser fixture
+
regression test
```

### Loader problem

Parser output is correct but normalized DB is wrong.

Investigate:

```text
UPSERT key
mapping
transaction
soft delete
foreign IDs
```

### Identity problem

Source player profiles are correct but incorrectly canonicalized or unresolved.

Investigate player reconciliation.

### Result dedup problem

The same real-world match appears multiple times or legitimate matches were collapsed.

Investigate cross-source reconciliation rules.

---

## 23. Phase 10 — Create a Regression Corpus

Whenever the audit discovers a real scraper/parser bug:

1. Find the corresponding `raw_scrape_logs` record.
2. Preserve a representative fixture.
3. Add the raw response to scraper test fixtures.
4. Add expected normalized output.
5. Write a regression test.
6. Only then fix the parser.

Desired structure:

```text
apps/worker/src/__fixtures__/
    tt365/
    ttleagues/
    sport80/
    vetts/
```

Every important source variation should eventually exist in the corpus.

Examples:

```text
normal league match
walkover
retired match
doubles match
postponed fixture
missing player ID
historic TT365 page
changed matchcard format
cup match
tournament result
unexpected empty table
```

---

## 24. Evaluating a Scraper Change

Before approving a scraper/parser PR, the agent should perform the following.

### Step 1 — Identify affected adapter/parser

Example:

```text
TT365 matchcard parser
```

### Step 2 — Identify representative production payloads

Include:

```text
normal examples
edge cases
previous parser failures
different leagues
old/new layouts
```

### Step 3 — Run old implementation

Capture:

```text
players
fixtures
rubbers
scores
dates
outcomes
warnings
```

### Step 4 — Run new implementation against the SAME payloads

Do not re-fetch sources for the comparison.

### Step 5 — Calculate diff

Report:

```text
players added/removed
fixtures added/removed
rubbers added/removed
scores changed
dates changed
IDs changed
missing-player count changed
parse failures changed
duplicate candidates changed
```

### Step 6 — Explain every meaningful difference

Do not approve a change with unexplained production-data differences.

### Step 7 — Run audit checks against resulting dataset

Expected result:

```text
no new CRITICAL findings
no new ERROR findings
relevant quality metric improves or remains stable
```

### Step 8 — Add regression tests

Any newly supported production case should become a permanent test fixture.

---

## 25. Recommended Historical Audit Storage

Implement:

```text
data_quality_audit_runs
```

Suggested fields:

```text
id
run_key
environment
git_sha
started_at
finished_at
status
critical_count
error_count
warning_count
summary JSONB
```

And:

```text
data_quality_audit_results
```

Suggested fields:

```text
id
run_id

check_key
severity

scope_type
scope_id

value
threshold

passed

message
sample JSONB

created_at
```

This makes questions such as these answerable:

```text
Did TT365 quality improve after PR #123?

When did missing-player percentage jump?

Which deploy caused duplicate candidate count to increase?

Has VETTS reconciliation conflict rate been getting worse?
```

---

## 26. Recommended Daily Pipeline Change

Current conceptual pipeline:

```text
wait-for-ingestion
↓
reconcile
↓
ratings
↓
read-models
```

Recommended:

```text
wait-for-ingestion
↓
reconcile
↓
ratings
↓
read-models
↓
quality-audit
```

The `quality-audit` stage should execute inexpensive deterministic checks.

Suggested first set:

```text
PIPELINE-01
SCRAPE-01
SOURCE-01
DATA-01
DATA-02
DATA-03
DATA-05
IDENTITY-01
IDENTITY-02
IDENTITY-03
DEDUP-02
SCRAPER-DRIFT-01
COVERAGE-01
```

Do not initially block the pipeline for WARNING findings.

Recommended behaviour:

```text
CRITICAL
    pipeline status = failed

ERROR
    pipeline status = completed_with_quality_errors
    alert

WARNING
    pipeline completes
    record finding

INFO
    metrics only
```

If introducing a new pipeline status is undesirable initially:

```text
CRITICAL → fail
ERROR/WARNING → complete + audit findings
```

---

## 27. Scrape Attempt History Improvement

The current raw payload store deduplicates unchanged content.

Therefore create a separate concept:

```text
scrape_attempts
```

Suggested schema:

```text
id

pipeline_run_key
source_resource_id
raw_scrape_log_id

adapter_key
adapter_version

started_at
finished_at

http_status
payload_bytes
content_changed

fetch_status
parse_status
load_status

parsed_players
parsed_fixtures
parsed_rubbers

inserted_count
updated_count
unchanged_count

error_code
error_message

created_at
```

Then monitor:

```text
scrape success %
HTTP failure %
content change %
parse success %
load success %
average duration
payload size
players per scrape
fixtures per scrape
rubbers per scrape
```

This provides far better scraper observability than interpreting `raw_scrape_logs` as request history.

---

## 28. Improvement Backlog Generated by Audit

At the end of every full audit, categorize improvements into:

### A. Immediate correctness bugs

Examples:

```text
incorrect result
missing source
broken identity
parser regression
```

Create individual GitHub issues.

### B. Parser coverage gaps

Add source examples to regression corpus.

### C. Dedup improvements

Examples:

```text
better player evidence
new result matching evidence
new normalization rule
```

Do not loosen automatic merging without evaluating false-positive risk.

### D. Observability gaps

Examples:

```text
missing metric
cannot trace normalized row to source
missing scrape-attempt history
```

### E. Database invariants

If an audit repeatedly checks something that should **never** be invalid, consider enforcing it at DB level.

Example:

```text
only one confirmed canonical identity per source player
```

---

## 29. Agent Decision Rules

When the agent finds suspicious data:

```text
Evidence certain?
    YES
        ↓
Is it safe/invariant-level?
    YES → report as ERROR/CRITICAL
    NO  → report with evidence

Evidence uncertain?
    ↓
WARNING + review candidate
```

Never reason:

```text
same name = same player
```

Never reason:

```text
same players + same day = same rubber
```

without additional evidence.

Prefer:

```text
source IDs
event IDs
competition
date/time
score
winner
round
source URL
club
governing body ID
```

---

## 30. Final Agent Checklist

Before completing an audit, verify:

- [ ] Graphile scraping jobs inspected.
- [ ] Failed/stuck raw transforms checked.
- [ ] Active source-resource freshness checked.
- [ ] Completed fixtures without rubbers checked.
- [ ] Malformed rubbers checked.
- [ ] Missing-player rate calculated.
- [ ] Score completeness calculated.
- [ ] Non-completed fixtures with active rubbers checked.
- [ ] Canonical-player topology checked.
- [ ] Multiple confirmed identity links checked.
- [ ] Confirmed decision consistency checked.
- [ ] Pending identity backlog measured.
- [ ] Potential missed player matches sampled.
- [ ] Probable duplicate rubbers sampled.
- [ ] VETTS/source reconciliation health checked.
- [ ] Payload drift checked.
- [ ] Platform coverage compared with baseline.
- [ ] Every CRITICAL finding has evidence.
- [ ] Every ERROR has probable subsystem classification.
- [ ] Regression-test candidates identified.
- [ ] Recommended improvements prioritized.
- [ ] No production data was modified.

---

## 31. Required Final Report

Finish with:

```text
# Audit Result

Overall:
PASS / WARNING / FAIL

## Critical
<count>

## Errors
<count>

## Warnings
<count>

## Scraper Health

TT365:
...

TT Leagues:
...

Sport80:
...

VETTS:
...

## Production Data Quality

Players:
...

Fixtures:
...

Rubbers:
...

Scores:
...

## Identity Resolution

Canonical players:
...

Pending suggestions:
...

Broken links:
...

Potential missed matches:
...

## Result Deduplication

Potential duplicates:
...

VETTS linked:
...

VETTS conflicts:
...

VETTS unmatched:
...

## Regressions Detected

...

## Highest-Priority Improvements

1.
2.
3.

## Regression Tests To Add

1.
2.
3.

## Recommended GitHub Issues

1.
2.
3.
```

The audit is not complete until the report answers:

> Is the scraper operating correctly?

> Is the normalized production database internally consistent?

> Where is production data incomplete or suspicious?

> Is cross-source deduplication behaving safely?

> What concrete changes would most improve scraper reliability or data quality?

> Which production examples should become regression tests?

---

## 32. Known-Valid Patterns (Do Not Flag as Errors)

The following patterns have been investigated and confirmed as expected
behaviour or known source limitations. Future audits should classify them
as **INFO** at most, not WARNING or ERROR, unless the pattern changes
materially from what is described here.

### KVP-01 — Walkovers with missing player IDs

**Check:** DATA-02

A large volume of walkover rubbers (tens of thousands) will have one or
both `home_player_1_id` / `away_player_1_id` set to NULL. This is expected:
walkovers often list only the non-forfeiting player, and the TT Leagues API
may omit both player IDs for team-level forfeits.

**Action:** Report the count as INFO. Do not flag as ERROR.

### KVP-02 — Normal rubbers with both players missing on completed fixtures

**Check:** DATA-02

A few thousand "normal" rubbers on completed TT Leagues fixtures will
have both player IDs set to NULL despite having non-zero scores (e.g.
3-0, 0-3, 3-1). These are cases where the TT Leagues API returned player
entries with empty `userId` strings (unregistered/anonymous participants).
The parser intentionally preserves the rubber and score even when player
IDs cannot be linked, per the design documented in `parser.ts` and tested
in `ttleagues-parser.test.ts`.

**Action:** Report the count as INFO. Investigate only if the count
increases sharply compared to the previous audit.

### KVP-03 — TT Leagues `bundled=matches+sets` payload size drift

**Check:** SCRAPER-DRIFT-01

The TT Leagues API stopped including sets data in the
`?bundled=matches+sets` endpoint response (the `sets` object is now
empty). Historical payloads from this endpoint are much larger because
they included full sets data. The current scraper fetches sets
individually via `scrapeMatchSetsBatchTask` and no longer relies on the
bundled endpoint for sets.

**Action:** Exclude `bundled=matches+sets` endpoints from drift
detection, or classify their size reduction as INFO. The payload drift
is a known source API change, not a scraper bug.

### KVP-04 — Sport80 score_source metrics

**Check:** DATA-04

Sport80 rubbers will show 0% for `score_source = 'games'` because
Sport80 uses a different scoring model. Sport80 rubbers are 100% dated
(`played_at` is always populated). TT Leagues and TableTennis365
rubbers will show 0% for `played_at` because dates are stored on the
fixture (`date_played`), not on individual rubbers.

**Action:** Report per-platform metrics as INFO. Do not compare
`score_source` percentages across platforms without accounting for
their different scoring models.

### KVP-05 — Sport80 duplicate rubber groups

**Check:** DEDUP-01

Sport80 tournament results will produce thousands of duplicate rubber
groups (same two players, same competition, same day, same score). These
are legitimate repeated matches in tournament round-robin group stages
where players meet multiple times. The duplicate count is expected to be
in the range of 9,000–10,000 groups.

**Action:** Report the count as INFO. Investigate only if duplicates
appear in league (non-tournament) competitions or if the count changes
significantly.

### KVP-06 — New season source resources with no fetches

**Check:** SOURCE-01

When new TT Leagues seasons (e.g. 2026-27) are discovered, source
resources are registered with `last_fetched_at = NULL` and
`consecutive_failures = 0`. These are newly discovered resources that
have not yet been scraped. A large batch of unfetched resources for a
new season is expected.

**Action:** Classify as INFO if the resources are for a season that has
not yet started. Classify as WARNING if the season is active and
resources remain unfetched after 36 hours.

### KVP-07 — Stale pending raw scrape logs from retired scraper paths

**Check:** SCRAPE-01

Raw scrape logs may accumulate in `pending` status from retired scraper
paths (e.g. the old TT Leagues `bundled=matches+sets` endpoint, or
TableTennis365 pages that were later re-scraped and processed through a
newer pipeline). These logs are orphaned and will never be processed by
the current pipeline.

**Action:** Mark stale pending logs older than 2 hours as `failed`
during cleanup. Do not flag as ERROR unless new pending logs are
accumulating from currently active scraper paths.
