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

    // ── Compression (gzip/deflate) ───────────────────────────────────────────
    await app.register(compress, { global: true, threshold: 1024 });

    // ── Multipart (CSV uploads, etc.) ────────────────────────────────────────
    await app.register(multipart, {
        limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
    });

    // ── Cache-Control ────────────────────────────────────────────────────────
    // Ordered most-specific first.  The browser cache honours these headers;
    // TanStack Query's staleTime handles in-app deduplication separately.
    const CACHE_STATIC = 'public, max-age=300, stale-while-revalidate=600';
    const CACHE_DYNAMIC = 'public, max-age=30, stale-while-revalidate=60';
    const CACHE_LIVE = 'public, max-age=10, stale-while-revalidate=20';

    const cacheRules: Array<[RegExp, string]> = [
        [/^\/api\/leagues(\/|$)/, CACHE_STATIC],
        [/^\/api\/competitions(\/|$)/, CACHE_STATIC],
        [/^\/api\/players\/[\w-]+\/(profile-overview|season-affiliations|tournaments)(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/players\/[\w-]+\/(rubbers|form|rating-history|rivals)(\/|$)/, CACHE_LIVE],
        [/^\/api\/players(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/h2h(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/teams\/[\w-]+\/(summary|roster|form)(\/|$)/, CACHE_STATIC],
        [/^\/api\/fixtures\/[\w-]+\/rubbers(\/|$)/, CACHE_DYNAMIC],
        [/^\/api\/sources\/quality(\/|$)/, CACHE_STATIC],
        [/^\/api\/me(\/|$)/, 'private, no-store'],
        [/^\/api\/health(\/|$)/, 'no-cache'],
    ];

    app.addHook('onSend', async (request, reply, payload) => {
        const url = request.url;
        if (!reply.hasHeader('Cache-Control')) {
            const rule = cacheRules.find(([pattern]) => pattern.test(url));
            if (rule) reply.header('Cache-Control', rule[1]);
        }
        return payload;
    });

    // ── Health ───────────────────────────────────────────────────────────────
    app.get('/api/health', async () => {
        const result = await sql<{ now: Date }>`select now() as now`.execute(db);
        return { status: 'ok', database_time: result.rows[0]?.now ?? null };
    });

    // ── Routes ───────────────────────────────────────────────────────────────
    await app.register(competitionsRoutes(db), { prefix: '/api/competitions' });
    await app.register(leaguesRoutes(db), { prefix: '/api/leagues' });
    await app.register(teamsRoutes(db), { prefix: '/api/teams' });
    await app.register(playersRoutes(db), { prefix: '/api/players' });
    await app.register(playerRivalsRoutes(db), { prefix: '/api/players' });
    await app.register(h2hAnalysisRoutes(db), { prefix: '/api/h2h' });
    await app.register(h2hCommonOpponentRoutes(db), { prefix: '/api/h2h' });
    await app.register(fixturesRoutes(db), { prefix: '/api/fixtures' });
    await app.register(eventsRoutes(db), { prefix: '/api/events' });
    await app.register(eventEntryFormsRoutes(db), { prefix: '/api/events' });
    await app.register(leagueRatingsRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingAuditRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingPlayerCoverageRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingRankingQualityRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingSourceQualityRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingHistoryRoutes(db), { prefix: '/api/ratings' });
    await app.register(ratingsRoutes(db), { prefix: '/api/ratings' });
    await app.register(sourceQualityRoutes(db), { prefix: '/api/sources' });
    await app.register(scrapingMonitorRoutes(db), { prefix: '/api/scraping-monitor' });
    await app.register(userSyncRoutes(db), { prefix: '/api/me' });
    await app.register(feedbackRoutes(), { prefix: '/api/feedback' });

    return app;
}

export type AppInstance = Awaited<ReturnType<typeof buildApp>>;
