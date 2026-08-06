from pathlib import Path

def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text()
    count = text.count(old)
    if count != 1:
        raise RuntimeError(f"Expected one match in {path}, found {count}: {old[:80]!r}")
    file_path.write_text(text.replace(old, new, 1))

api_path = 'apps/api/src/routes/scraping-monitor.ts'

replace_once(
    api_path,
    """const RecentScrapeSchema = z.object({""",
    """const QueueJobDetailsSchema = QueueJobSchema.extend({
    payload: z.record(z.unknown()),
});

const QueueJobParamsSchema = z.object({
    jobId: z.string().regex(/^\\d+$/),
});

const ErrorResponseSchema = z.object({
    error: z.string(),
    statusCode: z.number().int(),
});

const RecentScrapeSchema = z.object({""",
)

replace_once(
    api_path,
    """interface ScrapeSummaryRow {""",
    """interface QueueJobDetailsRow extends QueueJobRow {
    payload: unknown;
}

interface ScrapeSummaryRow {""",
)

replace_once(
    api_path,
    """function percentage(part: number, total: number): number {""",
    """function isSensitivePayloadKey(key: string): boolean {
    const normalized = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    return [
        'authorization',
        'cookie',
        'credential',
        'password',
        'secret',
        'session',
        'token',
        'apikey',
    ].some((fragment) => normalized.includes(fragment));
}

function redactUrlSecrets(value: string): string {
    try {
        const url = new URL(value);
        let changed = false;

        if (url.username || url.password) {
            url.username = '[REDACTED]';
            url.password = '[REDACTED]';
            changed = true;
        }

        for (const key of [...url.searchParams.keys()]) {
            if (isSensitivePayloadKey(key)) {
                url.searchParams.set(key, '[REDACTED]');
                changed = true;
            }
        }

        return changed ? url.toString() : value;
    } catch {
        return value;
    }
}

export function redactJobPayload(value: unknown, key?: string): unknown {
    if (key && isSensitivePayloadKey(key)) return '[REDACTED]';
    if (Array.isArray(value)) return value.map((item) => redactJobPayload(item));

    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([entryKey, entryValue]) => [
                entryKey,
                redactJobPayload(entryValue, entryKey),
            ]),
        );
    }

    return typeof value === 'string' ? redactUrlSecrets(value) : value;
}

function percentage(part: number, total: number): number {""",
)

api_file = Path(api_path)
api_text = api_file.read_text()
route_tail = """        });
    };
}
"""
if not api_text.endswith(route_tail):
    raise RuntimeError('Unexpected scraping monitor route ending')

job_route = """        });

        app.get('/jobs/:jobId', {
            schema: {
                params: QueueJobParamsSchema,
                response: {
                    200: QueueJobDetailsSchema,
                    404: ErrorResponseSchema,
                },
            },
        }, async (request, reply) => {
            const { jobId } = QueueJobParamsSchema.parse(request.params);
            const result = await sql<QueueJobDetailsRow>`
                SELECT
                    id::text AS id,
                    task_identifier,
                    CASE
                        WHEN attempts >= max_attempts THEN 'failed'
                        WHEN locked_by IS NOT NULL THEN 'running'
                        WHEN run_at > now() THEN 'scheduled'
                        ELSE 'ready'
                    END AS state,
                    payload,
                    attempts,
                    max_attempts,
                    created_at,
                    updated_at,
                    run_at,
                    locked_at,
                    NULLIF(LEFT(COALESCE(last_error, ''), 10000), '') AS last_error
                FROM graphile_worker.jobs
                WHERE id = ${jobId}::bigint
                  AND task_identifier IN (${monitoredTaskSql()})
                LIMIT 1
            `.execute(db);
            const row = result.rows[0];

            if (!row) {
                return reply.status(404).send({
                    error: 'Queue job not found',
                    statusCode: 404,
                });
            }

            reply.header('Cache-Control', 'private, no-store');
            return reply.send({
                id: row.id,
                task_identifier: row.task_identifier,
                state: row.state,
                attempts: numberValue(row.attempts),
                max_attempts: numberValue(row.max_attempts),
                created_at: isoValue(row.created_at)!,
                updated_at: isoValue(row.updated_at)!,
                run_at: isoValue(row.run_at)!,
                locked_at: isoValue(row.locked_at),
                last_error: row.last_error,
                payload: objectValue(redactJobPayload(row.payload)),
            });
        });
    };
}
"""
api_file.write_text(api_text[:-len(route_tail)] + job_route)

mobile_data_path = 'apps/mobile/src/scraping-monitor.ts'
replace_once(
    mobile_data_path,
    """export interface RecentScrape {""",
    """export interface ScrapingQueueJobDetails extends ScrapingQueueJob {
    payload: Record<string, unknown>;
}

export interface RecentScrape {""",
)

mobile_data_file = Path(mobile_data_path)
mobile_data_text = mobile_data_file.read_text()
mobile_data_file.write_text(mobile_data_text + """

export function useScrapingQueueJobQuery(jobId: string | null) {
  return useQuery({
    queryKey: ['scraping', 'job', jobId],
    queryFn: ({ signal }: { signal: AbortSignal }) =>
      apiFetch<ScrapingQueueJobDetails>(`/scraping/jobs/${encodeURIComponent(jobId ?? '')}`, signal),
    enabled: jobId !== null,
    staleTime: 30_000,
  });
}
""")

page_path = 'apps/mobile/src/ScrapingMonitorPage.tsx'
replace_once(
    page_path,
    """  useScrapingMonitorQuery,
} from './scraping-monitor';""",
    """  useScrapingMonitorQuery,
  useScrapingQueueJobQuery,
} from './scraping-monitor';""",
)

replace_once(
    page_path,
    """export function ScrapingMonitorPage() {""",
    """function payloadLabel(key: string): string {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (character) => character.toUpperCase());
}

function payloadValue(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function isPayloadUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function ScrapingMonitorPage() {""",
)

replace_once(
    page_path,
    """  const [expandedRunKey, setExpandedRunKey] = useState<string | null>(null);
  const monitorQuery = useScrapingMonitorQuery(hours);""",
    """  const [expandedRunKey, setExpandedRunKey] = useState<string | null>(null);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const monitorQuery = useScrapingMonitorQuery(hours);
  const jobDetailsQuery = useScrapingQueueJobQuery(expandedJobId);""",
)

old_queue_audit = """            <PageSection surface=\"flat\" density=\"compact\" title=\"Queue Audit\" note={`${data.recent_jobs.length} current jobs`}>
              {data.recent_jobs.length === 0 ? (
                <EmptyState iconClassName=\"fa fa-inbox\" title=\"No queued jobs\" message=\"Completed Graphile jobs are removed from the queue; completed pipeline runs remain in Previous Runs.\" />
              ) : (
                <DesignList density=\"compact\" divider=\"hairline\" pageSize={12}>
                  {data.recent_jobs.map((job) => {
                    const jobMeta = queueStateMeta(job.state);
                    return (
                      <ListItem
                        key={job.id}
                        leading={<IconCircle iconClassName={jobMeta.icon} tone={jobMeta.tone} />}
                        title={taskLabel(job.task_identifier)}
                        subtitle={`${jobMeta.label} · attempt ${job.attempts}/${job.max_attempts} · updated ${formatDate(job.updated_at, { includeTime: true })}${job.last_error ? ` · ${job.last_error}` : ''}`}
                        trailing={<Pill tone={jobMeta.tone}>{jobMeta.label}</Pill>}
                      />
                    );
                  })}
                </DesignList>
              )}
            </PageSection>"""

new_queue_audit = """            <PageSection surface=\"flat\" density=\"compact\" title=\"Queue Audit\" note={`${data.recent_jobs.length} current jobs`}>
              {data.recent_jobs.length === 0 ? (
                <EmptyState iconClassName=\"fa fa-inbox\" title=\"No queued jobs\" message=\"Completed Graphile jobs are removed from the queue; completed pipeline runs remain in Previous Runs.\" />
              ) : (
                <DesignList density=\"compact\" divider=\"hairline\" pageSize={12}>
                  {data.recent_jobs.map((job) => {
                    const jobMeta = queueStateMeta(job.state);
                    const expanded = expandedJobId === job.id;
                    const details = expanded && jobDetailsQuery.data?.id === job.id
                      ? jobDetailsQuery.data
                      : null;
                    return (
                      <div className=\"tt-monitor-job\" key={job.id}>
                        <ListItem
                          leading={<IconCircle iconClassName={jobMeta.icon} tone={jobMeta.tone} />}
                          title={taskLabel(job.task_identifier)}
                          subtitle={`${jobMeta.label} · attempt ${job.attempts}/${job.max_attempts} · updated ${formatDate(job.updated_at, { includeTime: true })}${job.last_error ? ` · ${job.last_error}` : ''}`}
                          trailing={<Pill tone={jobMeta.tone}>{jobMeta.label}</Pill>}
                          onClick={() => setExpandedJobId(expanded ? null : job.id)}
                        />
                        {expanded && (
                          <div className=\"tt-monitor-job__details\">
                            {jobDetailsQuery.isLoading ? (
                              <p className=\"tt-monitor-job__message\">Loading job input…</p>
                            ) : jobDetailsQuery.isError ? (
                              <p className=\"tt-monitor-run__error\">
                                {jobDetailsQuery.error instanceof Error ? jobDetailsQuery.error.message : 'Job details could not be loaded.'}
                              </p>
                            ) : details ? (
                              <>
                                <dl className=\"tt-monitor-run__facts\">
                                  <div>
                                    <dt>Job ID</dt>
                                    <dd>{details.id}</dd>
                                  </div>
                                  <div>
                                    <dt>Created</dt>
                                    <dd>{formatDate(details.created_at, { includeTime: true })}</dd>
                                  </div>
                                  <div>
                                    <dt>Run at</dt>
                                    <dd>{formatDate(details.run_at, { includeTime: true })}</dd>
                                  </div>
                                  <div>
                                    <dt>Locked</dt>
                                    <dd>{timeLabel(details.locked_at, 'Not locked')}</dd>
                                  </div>
                                  <div>
                                    <dt>Updated</dt>
                                    <dd>{formatDate(details.updated_at, { includeTime: true })}</dd>
                                  </div>
                                  <div>
                                    <dt>Attempts</dt>
                                    <dd>{details.attempts}/{details.max_attempts}</dd>
                                  </div>
                                </dl>
                                {details.last_error && <p className=\"tt-monitor-run__error\">{details.last_error}</p>}
                                <h3 className=\"tt-monitor-job__heading\">Job input</h3>
                                {Object.keys(details.payload).length === 0 ? (
                                  <p className=\"tt-monitor-job__message\">This job has no input fields.</p>
                                ) : (
                                  <dl className=\"tt-monitor-job__payload\">
                                    {Object.entries(details.payload).map(([key, value]) => (
                                      <div key={key}>
                                        <dt>{payloadLabel(key)}</dt>
                                        <dd>
                                          {isPayloadUrl(value) ? (
                                            <a href={value} target=\"_blank\" rel=\"noreferrer\">{value}</a>
                                          ) : payloadValue(value)}
                                        </dd>
                                      </div>
                                    ))}
                                  </dl>
                                )}
                                <details className=\"tt-monitor-job__raw\">
                                  <summary>Raw job input JSON</summary>
                                  <pre>{JSON.stringify(details.payload, null, 2)}</pre>
                                </details>
                                <p className=\"tt-monitor-job__note\">Sensitive fields are redacted by the API.</p>
                              </>
                            ) : null}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </DesignList>
              )}
            </PageSection>"""

replace_once(page_path, old_queue_audit, new_queue_audit)

replace_once(
    page_path,
    """              Generated {formatDate(data.generated_at, { includeTime: true })}. Pipeline summaries are retained for 14 days; scraped payload content is not duplicated in run history.""",
    """              Generated {formatDate(data.generated_at, { includeTime: true })}. Pipeline summaries are retained for 14 days; queue job input is loaded on demand and sensitive fields are redacted.""",
)

css_path = 'apps/mobile/src/ScrapingMonitorPage.css'
css_file = Path(css_path)
css_text = css_file.read_text()
css_file.write_text(css_text + """

.tt-monitor-job__details {
  padding: 0 0.875rem 0.875rem;
  border-top: 1px solid var(--tt-color-border, rgba(15, 23, 42, 0.08));
}

.tt-monitor-job__message,
.tt-monitor-job__note {
  margin: 0;
  padding-top: 0.875rem;
  color: var(--tt-color-text-muted, #667085);
  font-size: 0.75rem;
  line-height: 1.45;
}

.tt-monitor-job__heading {
  margin: 0 0 0.5rem;
  color: var(--tt-color-text, #172033);
  font-size: 0.8125rem;
  line-height: 1.35;
}

.tt-monitor-job__payload {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.5rem;
  margin: 0;
}

.tt-monitor-job__payload div {
  min-width: 0;
  padding: 0.625rem 0.75rem;
  border-radius: 0.625rem;
  background: var(--tt-color-surface-subtle, rgba(148, 163, 184, 0.08));
}

.tt-monitor-job__payload dt {
  color: var(--tt-color-text-muted, #667085);
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  line-height: 1.3;
  text-transform: uppercase;
}

.tt-monitor-job__payload dd {
  margin: 0.25rem 0 0;
  color: var(--tt-color-text, #172033);
  font-size: 0.75rem;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.tt-monitor-job__payload a {
  color: var(--tt-color-accent, #2563eb);
}

.tt-monitor-job__raw {
  margin-top: 0.75rem;
  border: 1px solid var(--tt-color-border, rgba(15, 23, 42, 0.1));
  border-radius: 0.625rem;
  background: var(--tt-color-surface-subtle, rgba(148, 163, 184, 0.08));
}

.tt-monitor-job__raw summary {
  cursor: pointer;
  padding: 0.625rem 0.75rem;
  color: var(--tt-color-text, #172033);
  font-size: 0.75rem;
  font-weight: 600;
}

.tt-monitor-job__raw pre {
  max-height: 18rem;
  margin: 0;
  overflow: auto;
  padding: 0 0.75rem 0.75rem;
  color: var(--tt-color-text, #172033);
  font-size: 0.6875rem;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

@media (max-width: 480px) {
  .tt-monitor-job__payload {
    grid-template-columns: 1fr;
  }
}
""")

test_path = Path('apps/api/src/__tests__/scraping-monitor-payload.test.ts')
test_path.write_text("""import { describe, expect, it } from 'vitest';
import { redactJobPayload } from '../routes/scraping-monitor.js';

describe('scraping monitor job payload redaction', () => {
  it('redacts sensitive keys recursively while preserving useful scrape context', () => {
    expect(redactJobPayload({
      url: 'https://example.test/fixtures?season=2026&token=secret',
      tenantHost: 'example.ttleagues.com',
      platformType: 'ttleagues',
      competitionId: 'competition-1',
      authorization: 'Bearer secret',
      nested: {
        apiKey: 'secret',
        playerExternalId: 'player-7',
      },
      requests: [
        { cookie: 'session=secret', matchExternalId: 'match-9' },
      ],
    })).toEqual({
      url: 'https://example.test/fixtures?season=2026&token=%5BREDACTED%5D',
      tenantHost: 'example.ttleagues.com',
      platformType: 'ttleagues',
      competitionId: 'competition-1',
      authorization: '[REDACTED]',
      nested: {
        apiKey: '[REDACTED]',
        playerExternalId: 'player-7',
      },
      requests: [
        { cookie: '[REDACTED]', matchExternalId: 'match-9' },
      ],
    });
  });
});
""")
