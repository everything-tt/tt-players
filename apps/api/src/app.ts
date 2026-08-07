import Fastify, { type FastifyError } from 'fastify';
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
import { playerRivalsRoutes } from './routes/player-rivals.js';
import { h2hAnalysisRoutes } from './routes/h2h-analysis.js';
import { h2hCommonOpponentRoutes } from './routes/h2h-common-opponents.js';
import { fixturesRoutes } from './routes/fixtures.js';
import { eventsRoutes } from './routes/events.js';
import { eventEntryFormsRoutes } from './routes/event-entry-forms.js';
import { feedbackRoutes } from './routes/feedback.js';
import { leagueRatingsRoutes } from './routes/league-ratings.js';
import { ratingAuditRoutes } from './routes/rating-audit.js';
import { ratingCalculationAuditRoutes } from './routes/rating-calculation-audit.js';
import { ratingPlayerCoverageRoutes } from './routes/rating-player-coverage.js';
import { ratingRankingQualityRoutes } from './routes/rating-ranking-quality.js';
import { ratingSourceQualityRoutes } from './routes/rating-source-quality.js';
import { ratingHistoryRoutes } from './routes/rating-history.js';
import { ratingsRoutes } from './routes/ratings.js';
import { sourceQualityRoutes } from './routes/source-quality.js';
import { scrapingMonitorRoutes } from './routes/scraping-monitor.js';
import { userSyncRoutes } from './routes/user-sync.js';

function envInteger(name: string, fallback: number): number {
    const raw = process.env[name];
    if (raw === undefined || raw.trim() === '') return fallback;

    const value = Number(raw);
    if (!Number.isInteger(value) || value < 0) {
        throw new Error(`${name} must be a non-negative integer.`);
    }
    return value;
}

export async function buildApp(db: Kysely<Database>) {
    const app = Fastify({
        logger: process.env['NODE_ENV'] === 'test'
            ? false
            : {
                level: process.env['LOG_LEVEL'] || 'info',
                redact: ['req.headers.authorization'],
            },
        requestIdHeader: 'x-request-id',
        requestTimeout: envInteger('API_REQUEST_TIMEOUT_MS', 15_000),
        keepAliveTimeout: envInteger('API_KEEP_ALIVE_TIMEOUT_MS', 72_000),
        bodyLimit: envInteger('API_BODY_LIMIT_BYTES', 2 * 1024 * 1024),
    }).withTypeProvider<ZodTypeProvider>();

    app.setSerializerCompiler(serializerCompiler);
    app.setValidatorCompiler(validatorCompiler);

    const allowedOrigins = (process.env['ALLOWED_ORIGIN'] || 'http://localhost:7373')
        .split(',')
        .map((origin) => origin.trim())
        .filter(Boolean);
    await app.register(cors, {
        origin: allowedOrigins,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'OPTIONS'],
    });

    await app.register(compress, { global: true, threshold: 1024 });
    await app.register(multipart, {
        limits: {
            files: 4,
            fileSize: 1024 * 1024,
            fields: 7,
        },
    });

    const CACHE_STATIC = 'public, max-age=300, s-maxage=300, stale-while-revalidate=60';
    const CACHE_DYNAMIC = 'public, max-age=60, s-maxage=120, stale-while-revalidate=30';
    const CACHE_LEADERBOARD = 'public, max-age=300, s-maxage=600, stale-while-revalidate=120';

    const CACHE_ROUTE_MAP: Array<[RegExp, string]> = [
        [/^\/api\/leagues(\/|$)/, CACHE_STATIC],
        [/^\/api\/competitions\/[\w-]+\/standings(\/|$)/, CACHE_STATIC],
        [/^\/api\/players\/leaders(\/|$)/, CACHE_LEADERBOARD],
        [/^\/api\/ratings(\/|$)/, CACHE_LEADERBOARD],
        [/^\/api\/players\/count(\/|$)/, CACHE_STATIC],
        [/^\/api\/players\/search(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/players\/[\w-]+\/profile-overview(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/players\/[\w-]+\/rivals(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/players\/[\w-]+\/h2h\/[\w-]+\/analysis(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/players\/[\w-]+\/h2h\/[\w-]+\/common-opponents(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/teams\/[\w-]+\/(summary|roster|form)(\/|$)/, CACHE_STATIC],
        [/^\/api\/fixtures\/[\w-]+\/rubbers(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/sources\/quality(\/|$)/, CACHE_STATIC],
        [/^\/api\/scraping\/monitor(\/|$)/, 'private, no-store'],
        [/^\/api\/me(\/|$)/, 'private, no-store'],
        [/^\/api\/health(\/|$)/, 'no-cache'],
    ];

    app.addHook('onSend', async (request, reply) => {
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

    const slowRequestMs = envInteger('API_SLOW_REQUEST_MS', 1_000);
    app.addHook('onResponse', async (request, reply) => {
        if (reply.elapsedTime < slowRequestMs) return;

        request.log.warn({
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            elapsedMs: Math.round(reply.elapsedTime),
        }, 'slow request');
    });

    app.setErrorHandler((error: FastifyError, request, reply) => {
        const candidateStatus = error.statusCode;
        const statusCode = typeof candidateStatus === 'number'
            && candidateStatus >= 400
            && candidateStatus <= 599
            ? candidateStatus
            : 500;

        if (statusCode >= 500) {
            request.log.error({ err: error, statusCode }, 'request failed');
        }

        reply.status(statusCode).send({
            error: statusCode >= 500
                ? 'Internal Server Error'
                : error.message || 'Request failed',
            statusCode,
        });
    });

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
    await app.register(playerRivalsRoutes(db), { prefix: '/api/players' });
    await app.register(h2hAnalysisRoutes(db), { prefix: '/api/players' });
    await app.register(h2hCommonOpponentRoutes(db), { prefix: '/api/players' });
    await app.register(fixturesRoutes(db), { prefix: '/api/fixtures' });
    await app.register(eventsRoutes(db), { prefix: '/api/events' });
    await app.register(eventEntryFormsRoutes(db), { prefix: '/api/events' });
    await app.register(leagueRatingsRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingAuditRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingCalculationAuditRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingPlayerCoverageRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingRankingQualityRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingSourceQualityRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingHistoryRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingsRoutes(db), { prefix: '/api/ratings' });
    await app.register(sourceQualityRoutes(db), { prefix: '/api/sources' });
    await app.register(scrapingMonitorRoutes(db), { prefix: '/api/scraping' });
    await app.register(userSyncRoutes(db), { prefix: '/api/me' });
    await app.register(feedbackRoutes(), { prefix: '/api/feedback' });

    return app;
}
