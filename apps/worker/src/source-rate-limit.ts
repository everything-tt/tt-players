import { randomUUID } from 'node:crypto';
import { sql, type Kysely } from 'kysely';
import { db as workerDb } from '@tt-players/db';

export interface SourceRequestLease {
    sourceKey: string;
    token: string;
    grantedAt: Date;
}

export interface SourceLeaseAttempt {
    lease: SourceRequestLease | null;
    waitMs: number;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function distributedRateLimitEnabled(): boolean {
    if (process.env['SOURCE_DISTRIBUTED_RATE_LIMIT'] === '0') return false;
    return process.env['NODE_ENV'] !== 'test';
}

export async function tryAcquireSourceRequestLease(
    database: Kysely<any>,
    sourceKey: string,
    leaseMs: number,
): Promise<SourceLeaseAttempt> {
    const token = randomUUID();
    const safeLeaseMs = Math.max(1_000, Math.floor(leaseMs));

    return database.transaction().execute(async (trx) => {
        await sql`
            INSERT INTO staging.source_request_limits (source_key)
            VALUES (${sourceKey})
            ON CONFLICT (source_key) DO NOTHING
        `.execute(trx);

        const row = await sql<{
            next_allowed_at: Date;
            lease_token: string | null;
            lease_expires_at: Date | null;
            now: Date;
        }>`
            SELECT
                next_allowed_at,
                lease_token,
                lease_expires_at,
                now()::timestamp AS now
            FROM staging.source_request_limits
            WHERE source_key = ${sourceKey}
            FOR UPDATE
        `.execute(trx).then((result) => result.rows[0]);

        if (!row) throw new Error(`source request limit row missing for ${sourceKey}`);
        const now = new Date(row.now);
        const activeLeaseUntil = row.lease_token && row.lease_expires_at
            ? new Date(row.lease_expires_at)
            : null;
        const nextAllowedAt = new Date(row.next_allowed_at);
        const blockedUntil = activeLeaseUntil && activeLeaseUntil > nextAllowedAt
            ? activeLeaseUntil
            : nextAllowedAt;

        if (blockedUntil.getTime() > now.getTime()) {
            return {
                lease: null,
                waitMs: Math.max(1, blockedUntil.getTime() - now.getTime()),
            };
        }

        const leaseExpiresAt = new Date(now.getTime() + safeLeaseMs);
        await sql`
            UPDATE staging.source_request_limits
            SET
                lease_token = ${token}::uuid,
                lease_expires_at = ${leaseExpiresAt},
                updated_at = now()
            WHERE source_key = ${sourceKey}
        `.execute(trx);

        return {
            lease: { sourceKey, token, grantedAt: now },
            waitMs: 0,
        };
    });
}

export async function acquireSourceRequestLease(
    database: Kysely<any>,
    sourceKey: string,
    leaseMs: number,
): Promise<SourceRequestLease> {
    for (;;) {
        const attempt = await tryAcquireSourceRequestLease(database, sourceKey, leaseMs);
        if (attempt.lease) return attempt.lease;
        await sleep(Math.min(Math.max(attempt.waitMs, 1), 60_000));
    }
}

export async function releaseSourceRequestLease(
    database: Kysely<any>,
    lease: SourceRequestLease,
    minIntervalMs: number,
    cooldownMs = 0,
): Promise<void> {
    const intervalUntil = new Date(
        lease.grantedAt.getTime() + Math.max(0, Math.floor(minIntervalMs)),
    );
    const cooldownUntil = new Date(
        Date.now() + Math.max(0, Math.floor(cooldownMs)),
    );

    await sql`
        UPDATE staging.source_request_limits
        SET
            lease_token = NULL,
            lease_expires_at = NULL,
            next_allowed_at = greatest(
                next_allowed_at,
                ${intervalUntil}::timestamp,
                ${cooldownUntil}::timestamp
            ),
            updated_at = now()
        WHERE source_key = ${lease.sourceKey}
          AND lease_token = ${lease.token}::uuid
    `.execute(database);
}

export async function runSourceRateLimited<T>(
    sourceKey: string,
    minIntervalMs: number,
    leaseMs: number,
    operation: () => Promise<T>,
    cooldownForResult: (result: T) => number = () => 0,
): Promise<T> {
    if (!distributedRateLimitEnabled() || minIntervalMs <= 0) {
        return operation();
    }

    const lease = await acquireSourceRequestLease(
        workerDb as Kysely<any>,
        sourceKey,
        leaseMs,
    );
    let cooldownMs = 0;
    try {
        const result = await operation();
        cooldownMs = Math.max(0, cooldownForResult(result));
        return result;
    } finally {
        await releaseSourceRequestLease(
            workerDb as Kysely<any>,
            lease,
            minIntervalMs,
            cooldownMs,
        );
    }
}
