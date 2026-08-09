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

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number().int(),
});

interface SubmissionTarget {
    competitionId: string;
    source: string;
    eventStatus: string;
    duplicate: boolean;
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

async function findExistingSubmissionTarget(
    db: Kysely<any>,
    canonicalUrl: string,
): Promise<Omit<SubmissionTarget, 'duplicate'> | null> {
    const existing = await db
        .selectFrom('tournament_sources as ts')
        .innerJoin('competitions as c', 'c.id', 'ts.competition_id')
        .select([
            'ts.competition_id',
            'c.source',
            'c.event_status',
        ])
        .where('ts.provider', '=', MANUAL_SOURCE)
        .where('ts.source_type', '=', MANUAL_SOURCE_TYPE)
        .where('ts.source_url', '=', canonicalUrl)
        .where('c.deleted_at', 'is', null)
        .orderBy('ts.first_seen_at', 'asc')
        .executeTakeFirst();

    if (!existing) return null;
    return {
        competitionId: existing.competition_id,
        source: existing.source,
        eventStatus: existing.event_status,
    };
}

async function getOrCreateSubmissionTarget(
    db: Kysely<any>,
    canonicalUrl: string,
    urlHash: string,
    userId: string,
    now: Date,
): Promise<SubmissionTarget> {
    return db.transaction().execute(async (trx) => {
        // Serialize only submissions for the same canonical URL. This closes the race where
        // two first-time submitters both observe no provenance row before either inserts one.
        const urlLockKey = `tt-players:manual-tournament-url:${urlHash}`;
        await sql`select pg_advisory_xact_lock(hashtext(${urlLockKey}))`.execute(trx);

        const existing = await findExistingSubmissionTarget(trx, canonicalUrl);
        if (existing) {
            await addSubmitterSource(
                trx,
                existing.competitionId,
                canonicalUrl,
                urlHash,
                userId,
                now,
            );
            return { ...existing, duplicate: true };
        }

        const seasonId = await ensureManualSeason(trx);
        const externalId = `manual-submit:${urlHash}`;
        const orphaned = await trx
            .selectFrom('competitions')
            .select(['id', 'deleted_at'])
            .where('season_id', '=', seasonId)
            .where('external_id', '=', externalId)
            .executeTakeFirst();

        let competitionId: string;
        if (orphaned) {
            competitionId = orphaned.id;
            await trx
                .updateTable('competitions')
                .set({
                    name: PENDING_NAME,
                    display_name: null,
                    source: MANUAL_SOURCE,
                    source_url: canonicalUrl,
                    entry_url: canonicalUrl,
                    information_url: canonicalUrl,
                    event_status: 'unpublished',
                    deleted_at: null,
                    calendar_last_seen_at: now,
                    calendar_missing_count: 0,
                })
                .where('id', '=', competitionId)
                .execute();
        } else {
            const competition = await trx
                .insertInto('competitions')
                .values({
                    season_id: seasonId,
                    external_id: externalId,
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
            competitionId = competition.id;
        }

        await addSubmitterSource(
            trx,
            competitionId,
            canonicalUrl,
            urlHash,
            userId,
            now,
        );

        return {
            competitionId,
            source: MANUAL_SOURCE,
            eventStatus: 'unpublished',
            duplicate: Boolean(orphaned),
        };
    });
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
                const target = await getOrCreateSubmissionTarget(
                    db,
                    canonicalUrl,
                    urlHash,
                    user.id,
                    now,
                );

                if (target.source === MANUAL_SOURCE && target.eventStatus === 'unpublished') {
                    const queued = await enqueueOrServiceUnavailable(
                        db,
                        target.competitionId,
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
                    competition_id: target.competitionId,
                    status: target.eventStatus === 'unpublished'
                        ? 'processing'
                        : 'already_submitted',
                    duplicate: target.duplicate,
                });
            },
        );
    };
}
