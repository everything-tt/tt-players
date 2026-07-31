import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import { readDataVersion, type Database } from '@tt-players/db';

const HealthSchema = z.enum(['healthy', 'degraded', 'unobserved']);

const SourceQualityItemSchema = z.object({
    platform_id: z.string().uuid(),
    name: z.string(),
    base_url: z.string(),
    health: HealthSchema,
    leagues: z.number().int().nonnegative(),
    competitions: z.number().int().nonnegative(),
    fixtures: z.number().int().nonnegative(),
    rubbers: z.number().int().nonnegative(),
    dated_rubbers_pct: z.number().min(0).max(100),
    full_score_rubbers_pct: z.number().min(0).max(100),
    missing_player_rubbers: z.number().int().nonnegative(),
    external_players: z.number().int().nonnegative(),
    canonical_players: z.number().int().nonnegative(),
    total_scrapes: z.number().int().nonnegative(),
    failed_scrapes: z.number().int().nonnegative(),
    source_instances: z.number().int().nonnegative(),
    source_resources: z.number().int().nonnegative(),
    unhealthy_resources: z.number().int().nonnegative(),
    latest_activity_at: z.string().nullable(),
    last_error: z.string().nullable(),
});

export const SourceQualityResponseSchema = z.object({
    generated_at: z.string(),
    summary: z.object({
        providers: z.number().int().nonnegative(),
        healthy: z.number().int().nonnegative(),
        degraded: z.number().int().nonnegative(),
        unobserved: z.number().int().nonnegative(),
        leagues: z.number().int().nonnegative(),
        competitions: z.number().int().nonnegative(),
        canonical_players: z.number().int().nonnegative(),
        rubbers: z.number().int().nonnegative(),
        dated_rubbers_pct: z.number().min(0).max(100),
        full_score_rubbers_pct: z.number().min(0).max(100),
        missing_player_rubbers: z.number().int().nonnegative(),
        pending_identity_suggestions: z.number().int().nonnegative(),
        unhealthy_resources: z.number().int().nonnegative(),
    }),
    sources: z.array(SourceQualityItemSchema),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number().int(),
});

export function sourceQualityRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (app) {
        app.get('/quality', {
            schema: {
                response: {
                    200: SourceQualityResponseSchema,
                    503: ErrorSchema,
                },
            },
        }, async (_request, reply) => {
            const [snapshot, version] = await Promise.all([
                db
                    .selectFrom('source_quality_snapshots')
                    .select('content')
                    .where('key', '=', 'global')
                    .executeTakeFirst(),
                readDataVersion(db, 'source-quality'),
            ]);

            const parsed = SourceQualityResponseSchema.safeParse(snapshot?.content);
            if (!parsed.success) {
                return reply.status(503).send({
                    error: 'Source quality snapshot is not ready',
                    statusCode: 503,
                });
            }

            reply.header('ETag', `W/"source-quality-${version}"`);
            return reply.send(parsed.data);
        });
    };
}
