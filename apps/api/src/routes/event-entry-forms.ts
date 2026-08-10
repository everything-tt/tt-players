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
    prefill_parameter: z.literal('emailAddress').optional(),
});

const GoogleFormSchema = z.object({
    provider: z.literal('google_forms'),
    form_url: z.string().url(),
    title: z.string(),
    public_text: z.string().nullable().optional(),
    fields: z.array(GoogleFormFieldSchema),
});

const ProfileFieldSchema = z.enum([
    'entrantName',
    'dateOfBirth',
    'email',
    'phone',
    'tteMembershipNumber',
    'club',
    'county',
    'fullAddress',
    'nationalAssociation',
    'relationship',
    'currentDate',
    'guardianName',
    'guardianEmail',
    'guardianPhone',
]);

const SemanticMappingSchema = z.object({
    field_id: z.string(),
    profile_field: ProfileFieldSchema.nullable(),
    confidence: z.number().min(0).max(1),
    reason: z.string(),
});

const EventDetailSchema = z.object({
    field: z.enum([
        'display_name',
        'description',
        'start_date',
        'end_date',
        'entry_deadline',
        'venue_name',
        'venue_address',
        'venue_town',
        'venue_postcode',
        'organizer_name',
        'category',
        'entry_fee',
    ]),
    value: z.string(),
    confidence: z.number().min(0).max(1),
    evidence: z.string(),
    source_field_ids: z.array(z.string()),
});

const EntryFormCategorySchema = z.object({
    name: z.string(),
    entry_fee: z.string().nullable(),
});

const SemanticAnalysisSchema = z.object({
    version: z.literal(1),
    status: z.enum(['ready', 'failed']),
    provider: z.literal('openai_compatible'),
    model: z.string(),
    prompt_version: z.string(),
    analysis_key: z.string(),
    analyzed_at: z.string(),
    mappings: z.array(SemanticMappingSchema),
    event_details: z.array(EventDetailSchema),
    categories: z.array(EntryFormCategorySchema).optional(),
    error_message: z.string().nullable(),
});

const CachedEntryFormSchema = z.object({
    version: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    provider: z.literal('google_forms'),
    status: z.enum(['ready', 'failed']),
    source_url: z.string().url(),
    inspected_at: z.string(),
    fingerprint: z.string().nullable(),
    form: GoogleFormSchema.nullable(),
    semantic_analysis: SemanticAnalysisSchema.nullable().optional(),
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
