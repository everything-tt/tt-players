import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@tt-players/db';

const MAX_ATTACHMENT_BYTES = 1024 * 1024;
const MAX_ATTACHMENTS = 4;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

const BodySchema = z.object({
    name: z.string().optional().nullable(),
    email: z.string().email().or(z.literal('')).optional().nullable(),
    message_type: z.enum(['bug', 'feature', 'general', 'data_accuracy']),
    message: z.string().min(3),
    page_path: z.string().max(500).optional().nullable(),
    page_title: z.string().max(200).optional().nullable(),
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
    attachments: FeedbackAttachment[];
}> {
    const fields: Record<string, string> = {};
    const attachments: FeedbackAttachment[] = [];

    for await (const part of request.parts()) {
        if (part.type === 'file') {
            if (part.fieldname !== 'attachment' && part.fieldname !== 'attachments') {
                throw new Error('Unexpected file field');
            }
            if (attachments.length >= MAX_ATTACHMENTS) {
                throw new Error(`Attach up to ${MAX_ATTACHMENTS} screenshots`);
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
            attachments.push({
                filename: part.filename || 'feedback-image',
                mimeType: part.mimetype,
                content,
            });
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
            page_path: fields['page_path'] || null,
            page_title: fields['page_title'] || null,
        }),
        attachments,
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
                        : { body: BodySchema.parse(request.body), attachments: [] };
                    const { name, email, message_type, message, page_path, page_title } = parsed.body;
                    const cleanEmail = email && email.trim() !== '' ? email.trim() : null;
                    const cleanName = name && name.trim() !== '' ? name.trim() : null;
                    const cleanPagePath = page_path && page_path.trim() !== '' ? page_path.trim() : null;
                    const cleanPageTitle = page_title && page_title.trim() !== '' ? page_title.trim() : null;

                    const id = await db.transaction().execute(async (trx) => {
                        const result = await trx
                            .insertInto('staging.feedback')
                            .values({
                                name: cleanName,
                                email: cleanEmail,
                                message_type,
                                message: message.trim(),
                                page_path: cleanPagePath,
                                page_title: cleanPageTitle,
                            })
                            .returning('id')
                            .executeTakeFirstOrThrow();

                        if (parsed.attachments.length > 0) {
                            await trx
                                .insertInto('staging.feedback_attachments')
                                .values(parsed.attachments.map((attachment) => ({
                                    feedback_id: result.id,
                                    filename: attachment.filename,
                                    mime_type: attachment.mimeType,
                                    size_bytes: attachment.content.length,
                                    content: attachment.content,
                                })))
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
