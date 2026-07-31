#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';

export const DEFAULT_ENDPOINTS = [
    '/api/health',
    '/api/leagues',
    '/api/players/count',
    '/api/ratings?page=1&page_size=50',
    '/api/sources/quality',
];

function positiveInteger(value, name) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 1) {
        throw new Error(`${name} must be a positive integer`);
    }
    return parsed;
}

export function parseArgs(argv) {
    const config = {
        baseUrl: process.env.BASE_URL || 'http://127.0.0.1:3005',
        requests: 100,
        concurrency: 5,
        warmup: 10,
        endpoints: [],
        jsonOut: null,
    };

    for (let index = 0; index < argv.length; index += 1) {
        const argument = argv[index];
        const next = argv[index + 1];
        if (argument === '--base-url') {
            if (!next) throw new Error('--base-url requires a value');
            config.baseUrl = next;
            index += 1;
        } else if (argument === '--requests') {
            if (!next) throw new Error('--requests requires a value');
            config.requests = positiveInteger(next, 'requests');
            index += 1;
        } else if (argument === '--concurrency') {
            if (!next) throw new Error('--concurrency requires a value');
            config.concurrency = positiveInteger(next, 'concurrency');
            index += 1;
        } else if (argument === '--warmup') {
            if (!next) throw new Error('--warmup requires a value');
            config.warmup = positiveInteger(next, 'warmup');
            index += 1;
        } else if (argument === '--endpoint') {
            if (!next) throw new Error('--endpoint requires a value');
            config.endpoints.push(next);
            index += 1;
        } else if (argument === '--json-out') {
            if (!next) throw new Error('--json-out requires a value');
            config.jsonOut = next;
            index += 1;
        } else if (argument === '--help' || argument === '-h') {
            config.help = true;
        } else {
            throw new Error(`Unknown argument: ${argument}`);
        }
    }

    config.baseUrl = config.baseUrl.replace(/\/+$/, '');
    if (config.endpoints.length === 0) config.endpoints = [...DEFAULT_ENDPOINTS];
    config.endpoints = config.endpoints.map((endpoint) =>
        endpoint.startsWith('/') ? endpoint : `/${endpoint}`);
    return config;
}

export function percentile(sortedValues, probability) {
    if (sortedValues.length === 0) return null;
    const index = Math.max(
        0,
        Math.min(sortedValues.length - 1, Math.ceil(probability * sortedValues.length) - 1),
    );
    return sortedValues[index];
}

export function summarizeSamples(samples, elapsedMs) {
    const durations = samples
        .filter((sample) => sample.ok)
        .map((sample) => sample.durationMs)
        .sort((left, right) => left - right);
    const failed = samples.length - durations.length;
    const statuses = {};
    for (const sample of samples) {
        const key = sample.status == null ? 'network_error' : String(sample.status);
        statuses[key] = (statuses[key] ?? 0) + 1;
    }

    return {
        requests: samples.length,
        succeeded: durations.length,
        failed,
        error_rate: samples.length === 0 ? 0 : failed / samples.length,
        throughput_rps: elapsedMs <= 0 ? 0 : samples.length / (elapsedMs / 1000),
        latency_ms: {
            min: durations[0] ?? null,
            average: durations.length === 0
                ? null
                : durations.reduce((total, value) => total + value, 0) / durations.length,
            p50: percentile(durations, 0.5),
            p95: percentile(durations, 0.95),
            p99: percentile(durations, 0.99),
            max: durations.at(-1) ?? null,
        },
        statuses,
    };
}

async function requestOnce(url) {
    const startedAt = performance.now();
    try {
        const response = await fetch(url, {
            headers: { accept: 'application/json' },
            signal: AbortSignal.timeout(30_000),
        });
        await response.arrayBuffer();
        return {
            ok: response.ok,
            status: response.status,
            durationMs: performance.now() - startedAt,
        };
    } catch (error) {
        return {
            ok: false,
            status: null,
            durationMs: performance.now() - startedAt,
            error: error instanceof Error ? error.message : String(error),
        };
    }
}

async function runRequests(url, count, concurrency) {
    const samples = new Array(count);
    let nextIndex = 0;
    const worker = async () => {
        for (;;) {
            const index = nextIndex;
            nextIndex += 1;
            if (index >= count) return;
            samples[index] = await requestOnce(url);
        }
    };
    await Promise.all(
        Array.from({ length: Math.min(concurrency, count) }, () => worker()),
    );
    return samples;
}

export async function benchmarkEndpoint({
    baseUrl,
    endpoint,
    requests,
    concurrency,
    warmup,
}) {
    const url = new URL(endpoint, `${baseUrl}/`).toString();
    if (warmup > 0) await runRequests(url, warmup, Math.min(concurrency, warmup));

    const startedAt = performance.now();
    const samples = await runRequests(url, requests, concurrency);
    const elapsedMs = performance.now() - startedAt;
    return {
        endpoint,
        url,
        elapsed_ms: elapsedMs,
        ...summarizeSamples(samples, elapsedMs),
    };
}

function formatNumber(value) {
    return value == null ? '-' : value.toFixed(1);
}

function printHelp() {
    console.log(`Usage: node scripts/benchmark-api.mjs [options]\n\nOptions:\n  --base-url URL       API origin (default: BASE_URL or http://127.0.0.1:3005)\n  --requests N         Measured requests per endpoint (default: 100)\n  --concurrency N      Concurrent requests (default: 5)\n  --warmup N           Warm-up requests per endpoint (default: 10)\n  --endpoint PATH      Endpoint to measure; repeat for multiple endpoints\n  --json-out FILE      Write full results as JSON\n`);
}

async function main() {
    const config = parseArgs(process.argv.slice(2));
    if (config.help) {
        printHelp();
        return;
    }

    const results = [];
    for (const endpoint of config.endpoints) {
        console.log(`Measuring ${endpoint}...`);
        results.push(await benchmarkEndpoint({ ...config, endpoint }));
    }

    console.table(results.map((result) => ({
        endpoint: result.endpoint,
        requests: result.requests,
        failed: result.failed,
        rps: formatNumber(result.throughput_rps),
        p50_ms: formatNumber(result.latency_ms.p50),
        p95_ms: formatNumber(result.latency_ms.p95),
        p99_ms: formatNumber(result.latency_ms.p99),
        max_ms: formatNumber(result.latency_ms.max),
    })));

    const report = {
        generated_at: new Date().toISOString(),
        config: {
            base_url: config.baseUrl,
            requests: config.requests,
            concurrency: config.concurrency,
            warmup: config.warmup,
        },
        results,
    };

    if (config.jsonOut) {
        await mkdir(dirname(config.jsonOut), { recursive: true });
        await writeFile(config.jsonOut, `${JSON.stringify(report, null, 2)}\n`);
        console.log(`Wrote ${config.jsonOut}`);
    }

    if (results.some((result) => result.failed > 0)) process.exitCode = 1;
}

const isDirectRun = process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isDirectRun) {
    main().catch((error) => {
        console.error(error instanceof Error ? error.message : error);
        process.exitCode = 1;
    });
}
