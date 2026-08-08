import dotenv from 'dotenv';
import { db } from '@tt-players/db';
import { sql, type Kysely } from 'kysely';
import { chooseTournamentCandidateWithEmbeddings } from './event-embeddings.js';
import { parseSport80EventName } from './sport80-parser.js';

dotenv.config();

const database = db as Kysely<any>;
const requestedLimit = Number(process.env['SPORT80_MATCH_PREVIEW_LIMIT'] ?? '20');
const limit = Number.isInteger(requestedLimit) && requestedLimit > 0
    ? Math.min(requestedLimit, 100)
    : 20;

interface PreviewSourceRow {
    eventId: string;
    incomingName: string;
    eventDate: string | null;
    category: string | null;
    currentCompetitionId: string;
    currentCompetitionName: string;
    currentMatchMethod: string | null;
}

async function loadPreviewSources(): Promise<PreviewSourceRow[]> {
    return database
        .selectFrom('tournament_sources as source')
        .innerJoin(
            'competitions as current_competition',
            'current_competition.id',
            'source.competition_id',
        )
        .select([
            sql<string>`coalesce(source.external_id, source.source_key)`.as('eventId'),
            sql<string>`coalesce(source.raw_payload ->> 'name', current_competition.display_name, current_competition.name)`.as('incomingName'),
            sql<string | null>`coalesce(source.raw_payload ->> 'date', current_competition.start_date::text, current_competition.event_date::text)`.as('eventDate'),
            sql<string | null>`coalesce(source.raw_payload ->> 'category', current_competition.category)`.as('category'),
            'source.competition_id as currentCompetitionId',
            sql<string>`coalesce(current_competition.display_name, current_competition.name)`.as('currentCompetitionName'),
            'source.match_method as currentMatchMethod',
        ])
        .where('source.provider', '=', 'sport80')
        .where('source.source_type', '=', 'results')
        .where('source.match_method', 'in', [
            'separate',
            'review-pending',
            'embedding-review-pending',
        ])
        .orderBy('source.last_seen_at', 'desc')
        .limit(limit)
        .execute();
}

async function findCalendarCandidates(eventDate: string | null): Promise<Array<{
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    venue: string | null;
    category: string | null;
}>> {
    let query = database
        .selectFrom('competitions')
        .select([
            'id',
            sql<string>`coalesce(display_name, name)`.as('name'),
            sql<string | null>`start_date::text`.as('startDate'),
            sql<string | null>`end_date::text`.as('endDate'),
            sql<string | null>`nullif(concat_ws(' ', venue_name, venue_town, venue_postcode), '')`.as('venue'),
            'category',
        ])
        .where('type', '=', 'individual')
        .where('source', '=', 'tte-calendar')
        .where('deleted_at', 'is', null);

    if (eventDate && /^\d{4}-\d{2}-\d{2}$/.test(eventDate)) {
        query = query
            .where('start_date', '>=', sql<Date>`${eventDate}::date - interval '7 days'`)
            .where('start_date', '<=', sql<Date>`${eventDate}::date + interval '7 days'`);
    }

    return query.limit(50).execute();
}

async function main(): Promise<void> {
    const sources = await loadPreviewSources();
    const results: Array<Record<string, unknown>> = [];

    for (const source of sources) {
        const parsedName = parseSport80EventName(source.incomingName);
        const normalizedDate = source.eventDate ?? parsedName.dateFromName;
        const normalizedCategory = source.category ?? parsedName.category;
        const candidates = await findCalendarCandidates(normalizedDate);
        const choice = await chooseTournamentCandidateWithEmbeddings(
            database,
            {
                name: parsedName.displayName,
                startDate: normalizedDate,
                endDate: normalizedDate,
                category: normalizedCategory,
                venue: null,
            },
            candidates,
        );

        const result = {
            eventId: source.eventId,
            incomingName: parsedName.displayName,
            eventDate: normalizedDate,
            currentCompetitionId: source.currentCompetitionId,
            currentCompetitionName: source.currentCompetitionName,
            currentMatchMethod: source.currentMatchMethod,
            candidateCount: candidates.length,
            decision: choice.decision,
            candidateId: choice.candidate?.id ?? null,
            candidateName: choice.candidate?.name ?? null,
            score: choice.score?.total ?? null,
            semanticScore: choice.score?.semantic ?? null,
            dateScore: choice.score?.date ?? null,
            reason: choice.reason,
            embeddingUsed: choice.embeddingUsed,
            embeddingModel: choice.embeddingModel,
            embeddingError: choice.embeddingError ?? null,
        };
        results.push(result);
        console.log(`SPORT80_MATCH_PREVIEW_ITEM ${JSON.stringify(result)}`);
    }

    const counts = results.reduce<Record<string, number>>((accumulator, item) => {
        const decision = String(item.decision ?? 'unknown');
        accumulator[decision] = (accumulator[decision] ?? 0) + 1;
        return accumulator;
    }, {});
    const embeddingUsed = results.filter((item) => item.embeddingUsed === true).length;
    const embeddingErrors = results.filter((item) => item.embeddingError != null).length;
    const summary = {
        requestedLimit: limit,
        evaluated: results.length,
        decisions: counts,
        embeddingUsed,
        embeddingErrors,
        results,
    };

    console.log(`SPORT80_MATCH_PREVIEW_RESULT ${JSON.stringify(summary)}`);
}

main()
    .catch((error) => {
        console.error(error);
        process.exitCode = 1;
    })
    .finally(async () => {
        await db.destroy();
    });
