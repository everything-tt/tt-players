import { createHash } from 'node:crypto';
import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { sql, type Kysely } from 'kysely';
import { z } from 'zod';
import { requireSupabaseUser } from '../auth.js';

const MANUAL_SOURCE = 'manual-submit';
const MANUAL_SOURCE_TYPE = 'submission';
const MANUAL_PLATFORM_URL = 'https://tt-players.tourneypilot.com';
const MANUAL_LEAGUE_EXTERNAL_ID = 'manual-tournament-submissions';
const MANUAL_SEASON_EXTERNAL_ID = 'manual-tournament-submissions';
const PENDING_NAME = 'Pending tournament submission';

const BodySchema = z.object({
    url: z.string().trim().url().max(4096),
});

const ResponseSchema = z.object({
    competition_id: z.string().uuid(),
    status: z.enum(['processing', 'already_submitted']),
    duplicate: z.boolean(),
});

const ManualSubmissionSchema = z.object({
    submission_id: z.string().uuid(),
    competition_id: z.string().uuid(),
    status: z.enum(['processing', 'published', 'merged', 'failed']),
    status_message: z.string().nullable(),
    submitted_at: z.string(),
    source_url: z.string(),
    name: z.string().nullable(),
    start_date: z.string().nullable(),
    venue_name: z.string().nullable(),
    venue_town: z.string().nullable(),
    venue_postcode: z.string().nullable(),
    category: z.string().nullable(),
    event_status: z.string(),
});

const ManualSubmissionsResponseSchema = z.object({
    data: z.array(ManualSubmissionSchema),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number().int(),
});

function dateOnly(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function timestamp(value: unknown): string {
    if (value instanceof Date) return value.toISOString();
    return new Date(String(value)).toISOString();
}

function submissionPayload(value: unknown): Record<string, unknown> {
    return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function explicitSubmissionStatus(value: unknown): 'processing' | 'published' | 'merged' | 'failed' | null {
    return value === 'processing' || value === 'published' || value === 'merged' || value === 'failed'
        ? value
        : null;
}

export function normalizeManualTournamentUrl(input: string): string {
    const url = new URL(input.trim());
    if (url.protocol !== 'https:') {
        throw new Error('Only HTTPS tournament links are supported');
    }
    if (url.username || url.password) {
        throw new Error('Tournament links must not contain embedded credentials');
    }

    url.hash = '';

    if (url.hostname === 'docs.google.com') {
        const match = url.pathname.match(/^\/forms\/d\/(e\/)?([^/]+)/);
        if (match) {
            url.pathname = `/forms/d/${match[1] ?? ''}${match[2]}/viewform`;
            url.search = '';
        }
    }

    return url.toString();
}

export function manualTournamentUrlHash(url: string): string {
    return createHash('sha256').update(url).digest('hex');
}

async function ensureManualSeason(db: Kysely<any>): Promise<string> {
    await sql`select pg_advisory_xact_lock(hashtext('tt-players:manual-tournament-hierarchy'))`.execute(db);

    let platform = await db
        .selectFrom('platforms')
        .select('id')
        .where('base_url', '=', MANUAL_PLATFORM_URL)
        .executeTakeFirst();
    if (!platform) {
        platform = await db
            .insertInto('platforms')
            .values({
                name: 'TT Players',
                base_url: MANUAL_PLATFORM_URL,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
    }

    let league = await db
        .selectFrom('leagues')
        .select('id')
        .where('platform_id', '=', platform.id)
        .where('external_id', '=', MANUAL_LEAGUE_EXTERNAL_ID)
        .executeTakeFirst();
    if (!league) {
        league = await db
            .insertInto('leagues')
            .values({
                platform_id: platform.id,
                external_id: MANUAL_LEAGUE_EXTERNAL_ID,
                name: 'Manual tournament submissions',
            })
            .returning('id')
            .executeTakeFirstOrThrow();
    }

    let season = await db
        .selectFrom('seasons')
        .select('id')
        .where('league_id', '=', league.id)
        .where('external_id', '=', MANUAL_SEASON_EXTERNAL_ID)
        .executeTakeFirst();
    if (!season) {
        season = await db
            .insertInto('seasons')
            .values({
                league_id: league.id,
                external_id: MANUAL_SEASON_EXTERNAL_ID,
                name: 'Manual tournament submissions',
                is_active: true,
            })
            .returning('id')
            .executeTakeFirstOrThrow();
    }

    return season.id;
}

async function addSubmitterSource(
    db: Kysely<any>,
    competitionId: string,
    canonicalUrl: string,
    urlHash: string,
    userId: string,
    now: Date,
): Promise<void> {
    await db
        .insertInto('tournament_sources')
        .values({
            competition_id: competitionId,
            provider: MANUAL_SOURCE,
            source_type: MANUAL_SOURCE_TYPE,
            external_id: urlHash,
            source_url: canonicalUrl,
            source_key: `${urlHash}:${userId}`,
            payload_hash: urlHash,
            raw_payload: {
                submitted_url: canonicalUrl,
                submitted_at: now.toISOString(),
                submission_status: 'processing',
                submission_status_message: null,
            },
            first_seen_at: now,
            last_seen_at: now,
            missing_count: 0,
            match_method: 'user-submitted-url',
            match_confidence: 1,
            submitted_by_user_id: userId,
            created_at: now,
            updated_at: now,
        })
        .onConflict((conflict) => conflict
            .columns(['provider', 'source_type', 'source_key'])
            .doUpdateSet({
                competition_id: competitionId,
                source_url: canonicalUrl,
                last_seen_at: now,
                updated_at: now,
            }))
        .execute();
}

async function enqueueProcessing(db: Kysely<any>, competitionId: string): Promise<void> {
    const payload = JSON.stringify({ competitionId });
    const jobKey = `manual-tournament-submit:${competitionId}`;
    await sql`
        select graphile_worker.add_job(
            'processManualTournamentSubmissionTask',
            ${payload}::json,
            job_key := ${jobKey}
        )
    `.execute(db);
}

async function enqueueOrServiceUnavailable(
    db: Kysely<any>,
    competitionId: string,
    request: { log: { error: (context: unknown, message: string) => void } },
): Promise<boolean> {
    try {
        await enqueueProcessing(db, competitionId);
        return true;
    } catch (error) {
        request.log.error(
            { err: error, competitionId },
            'manual tournament submission processing queue unavailable',
        );
        return false;
    }
}

export function manualTournamentSubmissionRoutes(db: Kysely<any>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/manual-submissions',
            {
                schema: {
                    response: {
                        200: ManualSubmissionsResponseSchema,
                        401: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const user = await requireSupabaseUser(request, reply);
                if (!user) return;

                reply.header('Cache-Control', 'private, no-store');

                const rows = await db
                    .selectFrom('tournament_sources as ts')
                    .innerJoin('competitions as c', 'c.id', 'ts.competition_id')
                    .select([
                        'ts.id as submission_id',
                        'ts.competition_id',
                        'ts.source_url',
                        'ts.first_seen_at as submitted_at',
                        'ts.raw_payload',
                        'c.source as competition_source',
                        'c.name',
                        'c.display_name',
                        'c.start_date',
                        'c.venue_name',
                        'c.venue_town',
                        'c.venue_postcode',
                        'c.category',
                        'c.event_status',
                    ])
                    .where('ts.provider', '=', MANUAL_SOURCE)
                    .where('ts.source_type', '=', MANUAL_SOURCE_TYPE)
                    .where('ts.submitted_by_user_id', '=', user.id)
                    .where('c.deleted_at', 'is', null)
                    .orderBy('ts.first_seen_at', 'desc')
                    .execute();

                return reply.send({
                    data: rows.map((row: Record<string, any>) => {
                        const payload = submissionPayload(row.raw_payload);
                        const explicitStatus = explicitSubmissionStatus(payload.submission_status);
                        const fallbackStatus = row.competition_source !== MANUAL_SOURCE
                            ? 'merged' as const
                            : row.event_status === 'unpublished'
                                ? 'processing' as const
                                : 'published' as const;
                        return {
                            submission_id: row.submission_id,
                            competition_id: row.competition_id,
                            status: explicitStatus ?? fallbackStatus,
                            status_message: typeof payload.submission_status_message === 'string'
                                ? payload.submission_status_message
                                : null,
                            submitted_at: timestamp(row.submitted_at),
                            source_url: row.source_url,
                            name: row.display_name && row.display_name !== PENDING_NAME
                                ? row.display_name
                                : row.name && row.name !== PENDING_NAME
                                    ? row.name
                                    : null,
                            start_date: dateOnly(row.start_date),
                            venue_name: row.venue_name ?? null,
                            venue_town: row.venue_town ?? null,
                            venue_postcode: row.venue_postcode ?? null,
                            category: row.category ?? null,
                            event_status: row.event_status,
                        };
                    }),
                });
            },
        );

        app.post(
            '/manual-submit',
            {
                schema: {
                    body: BodySchema,
                    response: {
                        202: ResponseSchema,
                        400: ErrorSchema,
                        401: ErrorSchema,
                        503: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const user = await requireSupabaseUser(request, reply);
                if (!user) return;

                reply.header('Cache-Control', 'private, no-store');

                let canonicalUrl: string;
                try {
                    canonicalUrl = normalizeManualTournamentUrl(request.body.url);
                } catch (error) {
                    return reply.status(400).send({
                        error: error instanceof Error ? error.message : 'Invalid tournament URL',
                        statusCode: 400,
                    });
                }

                const urlHash = manualTournamentUrlHash(canonicalUrl);
                const now = new Date();

                const existing = await db
                    .selectFrom('tournament_sources as ts')
                    .innerJoin('competitions as c', 'c.id', 'ts.competition_id')
                    .select([
                        'ts.competition_id',
                        'c.source',
                        'c.event_status',
                        'c.deleted_at',
                    ])
                    .where('ts.provider', '=', MANUAL_SOURCE)
                    .where('ts.source_type', '=', MANUAL_SOURCE_TYPE)
                    .where('ts.source_url', '=', canonicalUrl)
                    .orderBy('ts.first_seen_at', 'asc')
                    .executeTakeFirst();

                if (existing && !existing.deleted_at) {
                    await addSubmitterSource(
                        db,
                        existing.competition_id,
                        canonicalUrl,
                        urlHash,
                        user.id,
                        now,
                    );

                    if (existing.source === MANUAL_SOURCE && existing.event_status === 'unpublished') {
                        const queued = await enqueueOrServiceUnavailable(
                            db,
                            existing.competition_id,
                            request,
                        );
                        if (!queued) {
                            return reply.status(503).send({
                                error: 'Tournament processing is temporarily unavailable. Please retry.',
                                statusCode: 503,
                            });
                        }
                    }

                    return reply.status(202).send({
                        competition_id: existing.competition_id,
                        status: existing.event_status === 'unpublished'
                            ? 'processing'
                            : 'already_submitted',
                        duplicate: true,
                    });
                }

                const competitionId = await db.transaction().execute(async (trx) => {
                    const seasonId = await ensureManualSeason(trx);
                    const competition = await trx
                        .insertInto('competitions')
                        .values({
                            season_id: seasonId,
                            external_id: `manual-submit:${urlHash}`,
                            name: PENDING_NAME,
                            display_name: null,
                            type: 'individual',
                            source: MANUAL_SOURCE,
                            source_url: canonicalUrl,
                            entry_url: canonicalUrl,
                            information_url: canonicalUrl,
                            event_status: 'unpublished',
                            record_kind: 'calendar',
                            calendar_first_seen_at: now,
                            calendar_last_seen_at: now,
                            calendar_missing_count: 0,
                        })
                        .returning('id')
                        .executeTakeFirstOrThrow();

                    await addSubmitterSource(
                        trx,
                        competition.id,
                        canonicalUrl,
                        urlHash,
                        user.id,
                        now,
                    );
                    return competition.id;
                });

                const queued = await enqueueOrServiceUnavailable(db, competitionId, request);
                if (!queued) {
                    return reply.status(503).send({
                        error: 'Tournament processing is temporarily unavailable. Please retry.',
                        statusCode: 503,
                    });
                }

                return reply.status(202).send({
                    competition_id: competitionId,
                    status: 'processing',
                    duplicate: false,
                });
            },
        );
    };
}
