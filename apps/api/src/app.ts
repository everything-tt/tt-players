import Fastify from 'fastify';
import cors from '@fastify/cors';
import compress from '@fastify/compress';
import {
    serializerCompiler,
    validatorCompiler,
    type ZodTypeProvider,
} from 'fastify-type-provider-zod';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

import { competitionsRoutes } from './routes/competitions.js';
import { leaguesRoutes } from './routes/leagues.js';
import { teamsRoutes } from './routes/teams.js';
import { playersRoutes } from './routes/players.js';
import { fixturesRoutes } from './routes/fixtures.js';
import { eventsRoutes } from './routes/events.js';

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

    await app.register(leaguesRoutes(db), { prefix: '/api/leagues' });
    await app.register(competitionsRoutes(db), { prefix: '/api/competitions' });
    await app.register(teamsRoutes(db), { prefix: '/api/teams' });
    await app.register(playersRoutes(db), { prefix: '/api/players' });
    await app.register(fixturesRoutes(db), { prefix: '/api/fixtures' });
    await app.register(eventsRoutes(db), { prefix: '/api/events' });

    return app;
}
