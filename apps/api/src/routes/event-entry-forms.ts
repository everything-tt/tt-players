import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { Kysely } from 'kysely';

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const GoogleFormFieldSchema = z.object({
    id: z.string(),
    label: z.string(),
    description: z.string().nullable(),
    kind: z.enum([
        'short_text',
        'paragraph',
        'multiple_choice',
        'dropdown',
        'checkboxes',
        'linear_scale',
        'grid',
        'date',
        'time',
        'unknown',
    ]),
    required: z.boolean(),
    options: z.array(z.string()),
});

const GoogleFormSchema = z.object({
    provider: z.literal('google_forms'),
    form_url: z.string().url(),
    title: z.string(),
    fields: z.array(GoogleFormFieldSchema),
});

const CachedEntryFormSchema = z.object({
    version: z.literal(1),
    provider: z.literal('google_forms'),
    status: z.enum(['ready', 'failed']),
    source_url: z.string().url(),
    inspected_at: z.string(),
    fingerprint: z.string().nullable(),
    form: GoogleFormSchema.nullable(),
    error_code: z.string().nullable(),
    error_message: z.string().nullable(),
});

const ResponseSchema = z.object({
    data: CachedEntryFormSchema.nullable(),
});

export function eventEntryFormsRoutes(db: Kysely<any>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/:id/entry-form',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: ResponseSchema,
                    },
                },
            },
            async (request, reply) => {
                reply.header('Cache-Control', 'public, max-age=60, s-maxage=300, stale-while-revalidate=60');
                const source = await db
                    .selectFrom('tournament_sources')
                    .select('raw_payload')
                    .where('competition_id', '=', request.params.id)
                    .where('provider', '=', 'google_forms')
                    .where('source_type', '=', 'entry_form')
                    .where('source_key', '=', request.params.id)
                    .executeTakeFirst();

                if (!source) return { data: null };
                const parsed = CachedEntryFormSchema.safeParse(source.raw_payload);
                return { data: parsed.success ? parsed.data : null };
            },
        );
    };
}
