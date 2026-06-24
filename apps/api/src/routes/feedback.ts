import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

const MAX_ATTACHMENT_BYTES = 1024 * 1024;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

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

interface FeedbackAttachment {
    filename: string;
    mimeType: string;
    content: Buffer;
}

function hasValidImageSignature(mimeType: string, content: Buffer): boolean {
    if (mimeType === 'image/png') {
        return content.length >= 8
            && content.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    }
    if (mimeType === 'image/jpeg') {
        return content.length >= 3
            && content[0] === 0xff
            && content[1] === 0xd8
            && content[2] === 0xff;
    }
    if (mimeType === 'image/webp') {
        return content.length >= 12
            && content.subarray(0, 4).toString('ascii') === 'RIFF'
            && content.subarray(8, 12).toString('ascii') === 'WEBP';
    }
    return false;
}

async function readMultipartFeedback(request: FastifyRequest): Promise<{
    body: z.infer<typeof BodySchema>;
    attachment: FeedbackAttachment | null;
}> {
    const fields: Record<string, string> = {};
    let attachment: FeedbackAttachment | null = null;

    for await (const part of request.parts()) {
        if (part.type === 'file') {
            if (part.fieldname !== 'attachment') {
                throw new Error('Unexpected file field');
            }
            if (!SUPPORTED_IMAGE_TYPES.has(part.mimetype)) {
                throw new Error('Attachment must be a PNG, JPEG, or WebP image');
            }
            const content = await part.toBuffer();
            if (content.length > MAX_ATTACHMENT_BYTES) {
                throw new Error('Attachment must be 1 MB or smaller');
            }
            if (!hasValidImageSignature(part.mimetype, content)) {
                throw new Error('Attachment content does not match its image type');
            }
            attachment = {
                filename: part.filename || 'feedback-image',
                mimeType: part.mimetype,
                content,
            };
        } else {
            fields[part.fieldname] = String(part.value);
        }
    }

    return {
        body: BodySchema.parse({
            name: fields['name'] || null,
            email: fields['email'] || null,
            message_type: fields['message_type'],
            message: fields['message'],
        }),
        attachment,
    };
}

export function feedbackRoutes(db: Kysely<Database>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.post(
            '/',
            {
                schema: {
                    response: {
                        200: ResponseSchema,
                        400: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                try {
                    const parsed = request.isMultipart()
                        ? await readMultipartFeedback(request)
                        : { body: BodySchema.parse(request.body), attachment: null };
                    const { name, email, message_type, message } = parsed.body;
                    const cleanEmail = email && email.trim() !== '' ? email.trim() : null;
                    const cleanName = name && name.trim() !== '' ? name.trim() : null;

                    const id = await db.transaction().execute(async (trx) => {
                        const result = await trx
                            .insertInto('staging.feedback')
                            .values({
                                name: cleanName,
                                email: cleanEmail,
                                message_type,
                                message: message.trim(),
                            })
                            .returning('id')
                            .executeTakeFirstOrThrow();

                        if (parsed.attachment) {
                            await trx
                                .insertInto('staging.feedback_attachments')
                                .values({
                                    feedback_id: result.id,
                                    filename: parsed.attachment.filename,
                                    mime_type: parsed.attachment.mimeType,
                                    size_bytes: parsed.attachment.content.length,
                                    content: parsed.attachment.content,
                                })
                                .execute();
                        }

                        return result.id;
                    });

                    return reply.send({ success: true, id });
                } catch (err) {
                    const message = err instanceof Error ? err.message : 'Invalid feedback submission';
                    const isValidationError = err instanceof z.ZodError
                        || message.includes('Attachment')
                        || message.includes('Unexpected file');

                    if (isValidationError) {
                        return reply.status(400).send({
                            error: message,
                            statusCode: 400,
                        });
                    }

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
