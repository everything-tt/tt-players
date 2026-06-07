import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

const BodySchema = z.object({
    name: z.string().optional().nullable(),
    email: z.string().email().or(z.literal('')).optional().nullable(),
    message_type: z.enum(['bug', 'feature', 'general']),
    message: z.string().min(3),
});

const ResponseSchema = z.object({
    success: z.boolean(),
    id: z.string().uuid(),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number(),
});

export function feedbackRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.post(
            '/',
            {
                schema: {
                    body: BodySchema,
                    response: {
                        200: ResponseSchema,
                        400: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { name, email, message_type, message } = request.body;

                try {
                    const cleanEmail = email && email.trim() !== '' ? email.trim() : null;
                    const cleanName = name && name.trim() !== '' ? name.trim() : null;

                    const result = await db
                        .insertInto('staging.feedback')
                        .values({
                            name: cleanName,
                            email: cleanEmail,
                            message_type,
                            message: message.trim(),
                        })
                        .returning('id')
                        .executeTakeFirstOrThrow();

                    return reply.send({
                        success: true,
                        id: result.id,
                    });
                } catch (err) {
                    request.log.error(err);
                    return reply.status(500).send({
                        error: 'Failed to save feedback entry',
                        statusCode: 500,
                    });
                }
            },
        );
    };
}
