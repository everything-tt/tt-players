import Fastify from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import multipart from '@fastify/multipart';
import {
    serializerCompiler,
    validatorCompiler,
    type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import { sql, type Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

import { competitionsRoutes } from './routes/competitions.js';
import { leaguesRoutes } from './routes/leagues.js';
import { teamsRoutes } from './routes/teams.js';
import { playersRoutes } from './routes/players.js';
import { fixturesRoutes } from './routes/fixtures.js';
import { eventsRoutes } from './routes/events.js';
import { feedbackRoutes } from './routes/feedback.js';

export async function buildApp(db: Kysely<Database>) {
    const app = Fastify({ logger: false }).withTypeProvider<ZodTypeProvider>();

    // ── Serialiser / validator (Zod) ─────────────────────────────────────────
    app.setSerializerCompiler(serializerCompiler);
    app.setValidatorCompiler(validatorCompiler);

    // ── CORS ─────────────────────────────────────────────────────────────────
    const allowedOrigins = (process.env['ALLOWED_ORIGIN'] || 'http://localhost:7373')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    await app.register(cors, {
        origin: allowedOrigins,
        methods: ['GET', 'OPTIONS'],
    });

    // ── Compression (gzip/deflate) ───────────────────────────────────────────
    await app.register(compress, { global: true, threshold: 1024 });
    await app.register(multipart, {
        limits: {
            files: 1,
            fileSize: 1024 * 1024,
            fields: 5,
        },
    });

    // ── Caching headers (Cache-Control) ─────────────────────────────────────
    const CACHE_STATIC = 'public, max-age=300, s-maxage=300, stale-while-revalidate=60';
    const CACHE_DYNAMIC = 'public, max-age=60, s-maxage=120, stale-while-revalidate=30';
    const CACHE_LEADERBOARD = 'public, max-age=300, s-maxage=600, stale-while-revalidate=120';

    const CACHE_ROUTE_MAP: Array<[RegExp, string]> = [
        [/^\/api\/leagues(\/|$)/, CACHE_STATIC],
        [/^\/api\/competitions\/[\w-]+\/standings(\/|$)/, CACHE_STATIC],
        [/^\/api\/players\/leaders(\/|$)/, CACHE_LEADERBOARD],
        [/^\/api\/players\/count(\/|$)/, CACHE_STATIC],
        [/^\/api\/players\/search(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/teams\/[\w-]+\/(summary|roster|form)(\/|$)/, CACHE_STATIC],
        [/^\/api\/fixtures\/[\w-]+\/rubbers(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/health(\/|$)/, 'no-cache'],
    ];

    app.addHook('onSend', async (request, reply, payload) => {
        if (reply.statusCode < 200 || reply.statusCode >= 300) return;
        if (reply.getHeader('Cache-Control')) return;

        const url = request.url.split('?')[0] ?? request.url;
        for (const [pattern, cacheControl] of CACHE_ROUTE_MAP) {
            if (pattern.test(url)) {
                reply.header('Cache-Control', cacheControl);
                reply.header('Surrogate-Control', cacheControl);
                break;
            }
        }
    });
    // ── Global error handler ──────────────────────────────────────────────────
    app.setErrorHandler((error: any, _request, reply) => {
        const statusCode = error.statusCode ?? 500;
        reply.status(statusCode).send({
            error: error.message ?? 'Internal Server Error',
            statusCode,
        });
    });

    // ── Routes ────────────────────────────────────────────────────────────────
    app.get('/api/health', async () => ({
        status: 'ok',
        service: 'tt-players-api',
    }));

    app.get('/api/health/db', async () => {
        await sql`select 1`.execute(db);

        return {
            status: 'ok',
            service: 'tt-players-api',
            database: 'ok',
        };
    });

    await app.register(leaguesRoutes(db), { prefix: '/api/leagues' });
    await app.register(competitionsRoutes(db), { prefix: '/api/competitions' });
    await app.register(teamsRoutes(db), { prefix: '/api/teams' });
    await app.register(playersRoutes(db), { prefix: '/api/players' });
    await app.register(fixturesRoutes(db), { prefix: '/api/fixtures' });
    await app.register(eventsRoutes(db), { prefix: '/api/events' });
    await app.register(feedbackRoutes(db), { prefix: '/api/feedback' });

    return app;
}
