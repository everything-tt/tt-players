import { runOnce } from 'graphile-worker';
import { sql } from 'kysely';
import { db } from '@tt-players/db';
import { taskList } from './task-list.js';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env['DATABASE_URL'];
if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
}

async function getQueueStatus() {
    const result = await sql<{
        total: string;
        available: string;
        locked: string;
        withError: string;
    }>`
        select
            count(*)::text as total,
            count(*) filter (where is_available and run_at <= now())::text as available,
            count(*) filter (where locked_by is not null)::text as locked,
            count(*) filter (where last_error is not null)::text as "withError"
        from graphile_worker._private_jobs
    `.execute(db);

    const row = result.rows[0];
    return {
        total: Number(row?.total ?? 0),
        available: Number(row?.available ?? 0),
        locked: Number(row?.locked ?? 0),
        withError: Number(row?.withError ?? 0),
    };
}

while (true) {
    const status = await getQueueStatus();
    console.log(
        `queue total=${status.total} available=${status.available} locked=${status.locked} with_error=${status.withError}`,
    );
    if (status.total === 0 || status.available === 0) break;

    await runOnce({
        connectionString,
        taskList,
    });
}

await db.destroy();
