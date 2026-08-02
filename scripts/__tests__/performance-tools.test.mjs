import test from 'node:test';
import assert from 'node:assert/strict';
import {
    parseArgs,
    percentile,
    summarizeSamples,
} from '../benchmark-api.mjs';
import {
    buildH2HRelevantRubbersPlanQuery,
    buildPlayerRivalsPlanQuery,
    summarizePlan,
} from '../capture-query-plans.mjs';

test('benchmark arguments are explicit and normalized', () => {
    const config = parseArgs([
        '--base-url', 'http://localhost:3005/',
        '--requests', '20',
        '--concurrency', '4',
        '--warmup', '2',
        '--endpoint', 'api/health',
        '--endpoint', '/api/players/count',
        '--json-out', 'artifacts/result.json',
    ]);

    assert.deepEqual(config, {
        baseUrl: 'http://localhost:3005',
        requests: 20,
        concurrency: 4,
        warmup: 2,
        endpoints: ['/api/health', '/api/players/count'],
        jsonOut: 'artifacts/result.json',
    });
});

test('percentiles use nearest-rank semantics', () => {
    const values = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    assert.equal(percentile(values, 0.5), 5);
    assert.equal(percentile(values, 0.95), 10);
    assert.equal(percentile([], 0.95), null);
});

test('sample summaries separate HTTP and network failures', () => {
    const summary = summarizeSamples([
        { ok: true, status: 200, durationMs: 10 },
        { ok: true, status: 200, durationMs: 20 },
        { ok: false, status: 503, durationMs: 30 },
        { ok: false, status: null, durationMs: 40 },
    ], 1000);

    assert.equal(summary.requests, 4);
    assert.equal(summary.succeeded, 2);
    assert.equal(summary.failed, 2);
    assert.equal(summary.error_rate, 0.5);
    assert.equal(summary.throughput_rps, 4);
    assert.deepEqual(summary.statuses, {
        200: 2,
        503: 1,
        network_error: 1,
    });
    assert.deepEqual(summary.latency_ms, {
        min: 10,
        average: 15,
        p50: 10,
        p95: 20,
        p99: 20,
        max: 20,
    });
});

test('query plan summaries include nested buffer and row totals', () => {
    const summary = summarizePlan([{
        'Planning Time': 1.25,
        'Execution Time': 3.5,
        Plan: {
            'Node Type': 'Nested Loop',
            'Total Cost': 20,
            'Plan Rows': 5,
            'Actual Rows': 4,
            'Shared Hit Blocks': 2,
            Plans: [
                {
                    'Node Type': 'Index Scan',
                    'Total Cost': 7,
                    'Plan Rows': 3,
                    'Actual Rows': 3,
                    'Shared Hit Blocks': 4,
                    'Shared Read Blocks': 1,
                },
                {
                    'Node Type': 'Sort',
                    'Total Cost': 12,
                    'Plan Rows': 2,
                    'Actual Rows': 1,
                    'Temp Written Blocks': 2,
                },
            ],
        },
    }]);

    assert.deepEqual(summary, {
        planning_time_ms: 1.25,
        execution_time_ms: 3.5,
        nodes: 3,
        total_cost: 20,
        plan_rows: 10,
        actual_rows: 8,
        shared_hit_blocks: 6,
        shared_read_blocks: 1,
        temp_read_blocks: 0,
        temp_written_blocks: 2,
    });
});

test('H2H plan capture uses raw source-id predicates compatible with partial indexes', () => {
    const query = buildH2HRelevantRubbersPlanQuery();

    assert.match(query, /home_player_1_id = ANY\(\$1::uuid\[\]\)/);
    assert.match(query, /away_player_1_id = ANY\(\$2::uuid\[\]\)/);
    assert.match(query, /is_doubles = false/);
    assert.match(query, /outcome_type <> 'walkover'/);
    assert.doesNotMatch(query, /COALESCE\([^)]*canonical_player_id/);
});

test('player-rivals plan ranks bounded opponent aggregates inside PostgreSQL', () => {
    const query = buildPlayerRivalsPlanQuery();

    assert.match(query, /WITH relevant AS MATERIALIZED/);
    assert.match(query, /home_player_1_id = ANY\(\$1::uuid\[\]\)/);
    assert.match(query, /away_player_1_id = ANY\(\$1::uuid\[\]\)/);
    assert.match(query, /ROW_NUMBER\(\) OVER \(\s*PARTITION BY opponent_id/);
    assert.match(query, /COUNT\(\*\) OVER \(PARTITION BY opponent_id\)/);
    assert.match(query, /FILTER \(WHERE sequence_number <= split_at\)/);
    assert.match(query, /category_rank <= 4/);
    assert.match(query, /'toughest'::text AS category/);
    assert.match(query, /'easiest'::text AS category/);
    assert.match(query, /'improving'::text AS category/);
});
