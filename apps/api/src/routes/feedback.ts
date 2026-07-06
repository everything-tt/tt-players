import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';

const MAX_ATTACHMENT_BYTES = 1024 * 1024;
const MAX_ATTACHMENTS = 4;
const SUPPORTED_IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);
const FEEDBACK_APP_ID = 'tt-players';
const DEFAULT_FEEDBACK_SERVICE_URL = 'https://feedback.graceliu.uk';

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
    statusCode: z.number().optional(),
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

function forwardedFor(request: FastifyRequest): string {
    const header = request.headers['x-forwarded-for'];
    if (Array.isArray(header)) return header[0] ?? request.ip;
    return header?.split(',')[0]?.trim() || request.ip;
}

export function feedbackRoutes(): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();
        const serviceUrl = (process.env['FEEDBACK_SERVICE_URL'] || DEFAULT_FEEDBACK_SERVICE_URL)
            .replace(/\/+$/, '');

        app.post(
            '/',
            {
                schema: {
                    response: {
                        201: ResponseSchema,
                        400: ErrorSchema,
                        429: ErrorSchema,
                        502: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                let parsed: {
                    body: z.infer<typeof BodySchema>;
                    attachments: FeedbackAttachment[];
                };

                try {
                    parsed = request.isMultipart()
                        ? await readMultipartFeedback(request)
                        : { body: BodySchema.parse(request.body), attachments: [] };
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
                        error: 'Failed to read feedback entry',
                        statusCode: 500,
                    });
                }

                const { name, email, message_type, message, page_path, page_title } = parsed.body;
                const cleanEmail = email?.trim() || null;
                const cleanName = name?.trim() || null;
                const cleanPagePath = page_path?.trim() || null;
                const cleanPageTitle = page_title?.trim() || null;
                const headers: Record<string, string> = {
                    'X-Forwarded-For': forwardedFor(request),
                };

                let endpoint = `${serviceUrl}/feedback`;
                let body: BodyInit;
                if (parsed.attachments.length > 0) {
                    endpoint += '/multipart';
                    const form = new FormData();
                    form.set('app_id', FEEDBACK_APP_ID);
                    form.set('message_type', message_type);
                    form.set('message', message.trim());
                    form.set('metadata', '{}');
                    if (cleanName) form.set('name', cleanName);
                    if (cleanEmail) form.set('email', cleanEmail);
                    if (cleanPagePath) form.set('page_path', cleanPagePath);
                    if (cleanPageTitle) form.set('page_title', cleanPageTitle);
                    for (const attachment of parsed.attachments) {
                        form.append(
                            'attachments',
                            new Blob(
                                [new Uint8Array(attachment.content)],
                                { type: attachment.mimeType },
                            ),
                            attachment.filename,
                        );
                    }
                    body = form;
                } else {
                    headers['Content-Type'] = 'application/json';
                    body = JSON.stringify({
                        app_id: FEEDBACK_APP_ID,
                        name: cleanName,
                        email: cleanEmail,
                        message_type,
                        message: message.trim(),
                        page_path: cleanPagePath,
                        page_title: cleanPageTitle,
                        metadata: {},
                    });
                }

                try {
                    const upstream = await fetch(endpoint, {
                        method: 'POST',
                        headers,
                        body,
                        signal: AbortSignal.timeout(15_000),
                    });
                    const payload = await upstream.json().catch(() => ({
                        error: 'Feedback service returned an invalid response',
                    })) as { success?: boolean; id?: string; error?: string };

                    if (upstream.status === 201) {
                        const result = ResponseSchema.safeParse(payload);
                        if (result.success) return reply.status(201).send(result.data);
                        return reply.status(502).send({
                            error: 'Feedback service returned an invalid response',
                            statusCode: 502,
                        });
                    }

                    const error = typeof payload.error === 'string'
                        ? payload.error
                        : 'Feedback service rejected the submission';
                    if (upstream.status === 400) return reply.status(400).send({ error });
                    if (upstream.status === 429) return reply.status(429).send({ error });
                    if (upstream.status === 500) return reply.status(500).send({ error });
                    return reply.status(502).send({ error, statusCode: 502 });
                } catch (err) {
                    request.log.error(err);
                    return reply.status(502).send({
                        error: 'Feedback service is unavailable',
                        statusCode: 502,
                    });
                }
            },
        );
    };
}
