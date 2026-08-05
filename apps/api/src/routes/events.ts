import type { FastifyPluginAsync } from 'fastify';
import { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { sql, type Kysely } from 'kysely';

const ParamsSchema = z.object({
    id: z.string().uuid(),
});

const EventItemSchema = z.object({
    id: z.string().uuid(),
    platform_id: z.string().uuid(),
    source: z.string(),
    external_id: z.string(),
    name: z.string(),
    event_date: z.string().nullable(),
    start_date: z.string().nullable(),
    end_date: z.string().nullable(),
    status: z.string(),
    category: z.string().nullable(),
    description: z.string().nullable(),
    venue_name: z.string().nullable(),
    venue_address: z.string().nullable(),
    venue_town: z.string().nullable(),
    venue_postcode: z.string().nullable(),
    venue_url: z.string().nullable(),
    organizer_name: z.string().nullable(),
    organizer_url: z.string().nullable(),
    entry_deadline: z.string().nullable(),
    entry_url: z.string().nullable(),
    information_url: z.string().nullable(),
    result_url: z.string().nullable(),
    public_url: z.string().nullable(),
    platform_name: z.string(),
    match_count: z.coerce.number().int(),
    source_count: z.coerce.number().int(),
});

const TournamentSourceSchema = z.object({
    provider: z.string(),
    source_type: z.string(),
    external_id: z.string().nullable(),
    source_url: z.string(),
    match_method: z.string().nullable(),
    match_confidence: z.coerce.number().nullable(),
    first_seen_at: z.string(),
    last_seen_at: z.string(),
});

const ListResponseSchema = z.object({
    data: z.array(EventItemSchema),
    total: z.number().int(),
    limit: z.number().int(),
    offset: z.number().int(),
});

const EventResultRowSchema = z.object({
    id: z.string().uuid(),
    played_at: z.string().nullable(),
    round_name: z.string().nullable(),
    round_order: z.number().int().nullable(),
    home_player_name: z.string(),
    home_player_external_id: z.string().nullable(),
    away_player_name: z.string(),
    away_player_external_id: z.string().nullable(),
    home_games_won: z.coerce.number().int().nullable(),
    away_games_won: z.coerce.number().int().nullable(),
    winner_side: z.string(),
    canonical_rubber_id: z.string().uuid().nullable(),
    home_player_resolved_id: z.string().uuid().nullable(),
    away_player_resolved_id: z.string().uuid().nullable(),
});

const GetResponseSchema = z.object({
    event: EventItemSchema,
    sources: z.array(TournamentSourceSchema),
    results: z.array(EventResultRowSchema),
});

const ErrorSchema = z.object({
    error: z.string(),
    statusCode: z.number(),
});

const SavedIdsSchema = z.string().refine((value) => {
    const ids = value.split(',').map((id) => id.trim()).filter(Boolean);
    return ids.length <= 200 && ids.every((id) => z.string().uuid().safeParse(id).success);
}, 'saved_ids must contain at most 200 comma-separated UUIDs');

const TournamentCategorySchema = z.enum([
    'cadet',
    'junior',
    'senior',
    'veterans',
    'women',
    'girls',
]);

const CategoriesSchema = z.string().refine((value) => {
    const categories = value.split(',').map((category) => category.trim()).filter(Boolean);
    return categories.length <= 6
        && categories.every((category) => TournamentCategorySchema.safeParse(category).success);
}, 'categories must contain valid comma-separated tournament categories');

const QuerySchema = z.object({
    q: z.string().optional(),
    status: z.enum([
        'upcoming',
        'in_progress',
        'completed',
        'cancelled',
        'postponed',
        'unpublished',
        'all',
    ]).optional(),
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    category: z.string().optional(),
    categories: CategoriesSchema.optional(),
    saved_ids: SavedIdsSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    offset: z.coerce.number().int().min(0).default(0),
});

type EventQuery = z.infer<typeof QuerySchema>;
type EventItem = z.infer<typeof EventItemSchema>;
type TournamentCategory = z.infer<typeof TournamentCategorySchema>;
type TournamentSourceItem = z.infer<typeof TournamentSourceSchema>;
type EventResultItem = z.infer<typeof EventResultRowSchema>;

const CATEGORY_REGEX: Record<TournamentCategory, string> = {
    cadet: '\\m(cadet|u-?(15|13|11)|under[- ]?(15|13|11))\\M',
    junior: '\\m(junior|youth|u-?(19|17)|under[- ]?(19|17))\\M',
    senior: '\\m(senior|adult)\\M',
    veterans: '\\m(veterans?|vets?|masters?|o-?(40|50|60|70)|over[- ]?(40|50|60|70))\\M',
    women: '\\m(women|woman|ladies|lady|female)\\M',
    girls: '\\m(girls?|girl)\\M',
};

const NON_SENIOR_OPEN_REGEX = '\\m(cadet|junior|youth|veterans?|vets?|masters?|women|woman|ladies|lady|girls?|girl|female|u-?(19|17|15|13|11)|under[- ]?(19|17|15|13|11)|o-?(40|50|60|70)|over[- ]?(40|50|60|70))\\M';

function categorySearchText() {
    return sql<string>`lower(concat_ws(' ', coalesce(c.category, ''), coalesce(c.display_name, c.name)))`;
}

function categoryCondition(category: TournamentCategory) {
    const text = categorySearchText();
    if (category === 'senior') {
        return sql<boolean>`(
            ${text} ~ ${CATEGORY_REGEX.senior}
            or (
                ${text} ~ ${'\\mopen\\M'}
                and not (${text} ~ ${NON_SENIOR_OPEN_REGEX})
            )
        )`;
    }
    return sql<boolean>`${text} ~ ${CATEGORY_REGEX[category]}`;
}

function parseCategories(value: string | undefined): TournamentCategory[] {
    if (!value) return [];
    return value
        .split(',')
        .map((category) => category.trim())
        .filter((category): category is TournamentCategory => TournamentCategorySchema.safeParse(category).success);
}

function applyEventFilters<T>(builder: T, query: EventQuery): T {
    let filtered = builder as any;
    filtered = filtered
        .where('c.type', '=', 'individual')
        .where('c.deleted_at', 'is', null);

    const savedIds = (query.saved_ids ?? '')
        .split(',')
        .map((id) => id.trim())
        .filter(Boolean);
    if (savedIds.length > 0) {
        filtered = filtered.where('c.id', 'in', savedIds);
    }

    if (query.q) {
        filtered = filtered.where(
            sql`coalesce(c.display_name, c.name)`,
            'ilike',
            `%${query.q}%`,
        );
    }

    if (query.status && query.status !== 'all') {
        if (query.status === 'upcoming') {
            filtered = filtered.where('c.event_status', 'in', [
                'upcoming',
                'entries_open',
                'entries_closed',
            ]);
        } else {
            filtered = filtered.where('c.event_status', '=', query.status);
        }

        if (query.status === 'completed') {
            filtered = filtered.where(sql<boolean>`exists (
                select 1
                from fixtures f
                join rubbers r on r.fixture_id = f.id
                where f.competition_id = c.id
                  and f.deleted_at is null
                  and r.deleted_at is null
                  and r.is_doubles = false
            )`);
        }
    }

    if (query.from) {
        filtered = filtered.where(
            sql`coalesce(c.start_date, c.event_date)`,
            '>=',
            query.from,
        );
    }
    if (query.to) {
        filtered = filtered.where(
            sql`coalesce(c.start_date, c.event_date)`,
            '<=',
            query.to,
        );
    }
    if (query.category) {
        filtered = filtered.where('c.category', 'ilike', `%${query.category}%`);
    }

    const categories = parseCategories(query.categories);
    if (categories.length > 0) {
        filtered = filtered.where(sql<boolean>`(
            ${sql.join(categories.map(categoryCondition), sql` or `)}
        )`);
    }

    return filtered as T;
}

function applyEventOrdering<T>(builder: T, query: EventQuery): T {
    let ordered = builder as any;
    if (query.status === 'upcoming' || query.status === 'in_progress') {
        ordered = ordered
            .orderBy(sql`coalesce(c.start_date, c.event_date)`, 'asc')
            .orderBy(sql`coalesce(c.display_name, c.name)`, 'asc')
            .orderBy('c.id', 'asc');
    } else {
        ordered = ordered
            .orderBy(sql`coalesce(c.start_date, c.event_date)`, 'desc')
            .orderBy(sql`coalesce(c.display_name, c.name)`, 'asc')
            .orderBy('c.id', 'asc');
    }
    return ordered as T;
}

function calendarPayloadField(field: string) {
    return sql<string | null>`(
        select nullif(ts.raw_payload ->> ${field}, '')
        from tournament_sources ts
        where ts.competition_id = c.id
          and ts.source_type = 'calendar'
        order by ts.last_seen_at desc
        limit 1
    )`;
}

function eventSelection() {
    return [
        'c.id',
        'p.id as platform_id',
        sql<string>`coalesce(c.source, 'canonical')`.as('source'),
        'c.external_id',
        sql<string>`coalesce(c.display_name, c.name)`.as('name'),
        sql<string | null>`c.event_date::text`.as('event_date'),
        sql<string | null>`coalesce(c.start_date, c.event_date)::text`.as('start_date'),
        sql<string | null>`c.end_date::text`.as('end_date'),
        sql<string>`coalesce(c.status_override, c.event_status, case when c.event_date < current_date then 'completed' else 'upcoming' end)`.as('status'),
        'c.category',
        calendarPayloadField('description').as('description'),
        'c.venue_name',
        'c.venue_address',
        'c.venue_town',
        'c.venue_postcode',
        calendarPayloadField('venueUrl').as('venue_url'),
        calendarPayloadField('organizerName').as('organizer_name'),
        calendarPayloadField('organizerUrl').as('organizer_url'),
        sql<string | null>`c.entry_deadline::text`.as('entry_deadline'),
        'c.entry_url',
        'c.information_url',
        sql<string | null>`(
            select ts.source_url
            from tournament_sources ts
            where ts.competition_id = c.id
              and ts.source_type = 'results'
            order by ts.last_seen_at desc
            limit 1
        )`.as('result_url'),
        sql<string | null>`coalesce(c.information_url, c.source_url)`.as('public_url'),
        'p.name as platform_name',
        sql<number>`(
            select count(*)
            from fixtures f
            join rubbers r on r.fixture_id = f.id
            where f.competition_id = c.id
              and f.deleted_at is null
              and r.deleted_at is null
              and r.is_doubles = false
        )`.as('match_count'),
        sql<number>`(
            select count(*)
            from tournament_sources ts
            where ts.competition_id = c.id
        )`.as('source_count'),
    ] as const;
}

function nullableString(value: unknown): string | null {
    return value === null || value === undefined ? null : String(value);
}

function nullableNumber(value: unknown): number | null {
    return value === null || value === undefined ? null : Number(value);
}

function mapEvent(event: Record<string, unknown>): EventItem {
    return {
        id: String(event.id),
        platform_id: String(event.platform_id),
        source: String(event.source),
        external_id: String(event.external_id),
        name: String(event.name),
        event_date: nullableString(event.event_date),
        start_date: nullableString(event.start_date),
        end_date: nullableString(event.end_date),
        status: String(event.status),
        category: nullableString(event.category),
        description: nullableString(event.description),
        venue_name: nullableString(event.venue_name),
        venue_address: nullableString(event.venue_address),
        venue_town: nullableString(event.venue_town),
        venue_postcode: nullableString(event.venue_postcode),
        venue_url: nullableString(event.venue_url),
        organizer_name: nullableString(event.organizer_name),
        organizer_url: nullableString(event.organizer_url),
        entry_deadline: nullableString(event.entry_deadline),
        entry_url: nullableString(event.entry_url),
        information_url: nullableString(event.information_url),
        result_url: nullableString(event.result_url),
        public_url: nullableString(event.public_url),
        platform_name: String(event.platform_name),
        match_count: Number(event.match_count ?? 0),
        source_count: Number(event.source_count ?? 0),
    };
}

function mapSource(source: Record<string, unknown>): TournamentSourceItem {
    return {
        provider: String(source.provider),
        source_type: String(source.source_type),
        external_id: nullableString(source.external_id),
        source_url: String(source.source_url),
        match_method: nullableString(source.match_method),
        match_confidence: source.match_confidence === null || source.match_confidence === undefined
            ? null
            : Number(source.match_confidence),
        first_seen_at: String(source.first_seen_at),
        last_seen_at: String(source.last_seen_at),
    };
}

function mapResult(result: Record<string, unknown>): EventResultItem {
    return {
        id: String(result.id),
        played_at: result.played_at
            ? result.played_at instanceof Date
                ? result.played_at.toISOString()
                : String(result.played_at)
            : null,
        round_name: nullableString(result.round_name),
        round_order: result.round_order === null || result.round_order === undefined
            ? null
            : Number(result.round_order),
        home_player_name: String(result.home_player_name),
        home_player_external_id: nullableString(result.home_player_external_id),
        away_player_name: String(result.away_player_name),
        away_player_external_id: nullableString(result.away_player_external_id),
        home_games_won: nullableNumber(result.home_games_won),
        away_games_won: nullableNumber(result.away_games_won),
        winner_side: String(result.winner_side),
        canonical_rubber_id: nullableString(result.canonical_rubber_id),
        home_player_resolved_id: nullableString(result.home_player_resolved_id),
        away_player_resolved_id: nullableString(result.away_player_resolved_id),
    };
}

export function eventsRoutes(db: Kysely<any>): FastifyPluginAsync {
    return async function (fastify) {
        const app = fastify.withTypeProvider<ZodTypeProvider>();

        app.get(
            '/',
            {
                schema: {
                    querystring: QuerySchema,
                    response: {
                        200: ListResponseSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request) => {
                const query = request.query;

                // Match and page lightweight tournament IDs first. Expensive metadata and
                // rubber/source aggregation is deliberately deferred until after LIMIT/OFFSET,
                // mirroring the candidate-first player search strategy.
                let pageBuilder = db
                    .selectFrom('competitions as c')
                    .select([
                        'c.id',
                        sql<number>`count(*) over()`.as('total'),
                    ]);
                pageBuilder = applyEventFilters(pageBuilder, query);
                pageBuilder = applyEventOrdering(pageBuilder, query);

                const pageRows = await pageBuilder
                    .limit(query.limit)
                    .offset(query.offset)
                    .execute();
                const pageIds = pageRows.map((row: { id: string }) => row.id);

                let total = pageRows.length > 0
                    ? Number((pageRows[0] as { total: number | string }).total)
                    : 0;

                // Preserve total for an out-of-range offset. Normal first-page and infinite
                // scroll requests never need this fallback count.
                if (pageRows.length === 0 && query.offset > 0) {
                    let countBuilder = db
                        .selectFrom('competitions as c')
                        .select(db.fn.countAll().as('count'));
                    countBuilder = applyEventFilters(countBuilder, query);
                    const countRes = await countBuilder.executeTakeFirst();
                    total = Number(countRes?.count ?? 0);
                }

                if (pageIds.length === 0) {
                    return {
                        data: [],
                        total,
                        limit: query.limit,
                        offset: query.offset,
                    };
                }

                const enrichedRows = await db
                    .selectFrom('competitions as c')
                    .innerJoin('seasons as s', 's.id', 'c.season_id')
                    .innerJoin('leagues as l', 'l.id', 's.league_id')
                    .innerJoin('platforms as p', 'p.id', 'l.platform_id')
                    .select(eventSelection())
                    .where('c.id', 'in', pageIds)
                    .execute();

                const enrichedById = new Map(
                    enrichedRows.map((event: Record<string, unknown>) => [String(event.id), event]),
                );
                const events = pageIds
                    .map((id) => enrichedById.get(id))
                    .filter((event): event is Record<string, unknown> => event !== undefined);

                return {
                    data: events.map((event) => mapEvent(event)),
                    total,
                    limit: query.limit,
                    offset: query.offset,
                };
            },
        );

        app.get(
            '/:id',
            {
                schema: {
                    params: ParamsSchema,
                    response: {
                        200: GetResponseSchema,
                        404: ErrorSchema,
                        500: ErrorSchema,
                    },
                },
            },
            async (request, reply) => {
                const { id } = request.params;
                const event = await db
                    .selectFrom('competitions as c')
                    .innerJoin('seasons as s', 's.id', 'c.season_id')
                    .innerJoin('leagues as l', 'l.id', 's.league_id')
                    .innerJoin('platforms as p', 'p.id', 'l.platform_id')
                    .select(eventSelection())
                    .where('c.id', '=', id)
                    .where('c.type', '=', 'individual')
                    .where('c.deleted_at', 'is', null)
                    .executeTakeFirst();

                if (!event) {
                    return reply.status(404).send({
                        error: `Event ${id} not found`,
                        statusCode: 404,
                    });
                }

                const [sources, results] = await Promise.all([
                    db
                        .selectFrom('tournament_sources')
                        .select([
                            'provider',
                            'source_type',
                            'external_id',
                            'source_url',
                            'match_method',
                            'match_confidence',
                            sql<string>`first_seen_at::text`.as('first_seen_at'),
                            sql<string>`last_seen_at::text`.as('last_seen_at'),
                        ])
                        .where('competition_id', '=', id)
                        .orderBy('source_type', 'asc')
                        .orderBy('provider', 'asc')
                        .execute(),
                    db
                        .selectFrom('rubbers as r')
                        .innerJoin('fixtures as f', 'f.id', 'r.fixture_id')
                        .leftJoin('external_players as hp1', 'hp1.id', 'r.home_player_1_id')
                        .leftJoin('external_players as ap1', 'ap1.id', 'r.away_player_1_id')
                        .select([
                            'r.id',
                            'r.played_at',
                            'r.home_games_won',
                            'r.away_games_won',
                            'f.round_name',
                            'f.round_order',
                            sql<string>`COALESCE(hp1.name, 'Unknown')`.as('home_player_name'),
                            sql<string | null>`hp1.external_id`.as('home_player_external_id'),
                            sql<string>`COALESCE(ap1.name, 'Unknown')`.as('away_player_name'),
                            sql<string | null>`ap1.external_id`.as('away_player_external_id'),
                            sql<string>`CASE WHEN r.home_games_won > r.away_games_won THEN 'home' ELSE 'away' END`.as('winner_side'),
                            sql<string | null>`r.id`.as('canonical_rubber_id'),
                            sql<string | null>`COALESCE(hp1.canonical_player_id, hp1.id)`.as('home_player_resolved_id'),
                            sql<string | null>`COALESCE(ap1.canonical_player_id, ap1.id)`.as('away_player_resolved_id'),
                        ])
                        .where('f.competition_id', '=', id)
                        .where('r.deleted_at', 'is', null)
                        .where('r.is_doubles', '=', false)
                        .orderBy('f.round_order', 'asc')
                        .orderBy('r.played_at', 'asc')
                        .execute(),
                ]);

                return {
                    event: mapEvent(event),
                    sources: sources.map((source: Record<string, unknown>) => mapSource(source)),
                    results: results.map((result: Record<string, unknown>) => mapResult(result)),
                };
            },
        );
    };
}
