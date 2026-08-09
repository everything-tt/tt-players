import type { Kysely } from 'kysely';
import { chooseTournamentCandidate } from './tournament-reconciliation.js';
import { normalizeTournamentName, normalizeVenue } from './tournament-normalization.js';

const MANUAL_SOURCE = 'manual-submit';
const PENDING_NAME = 'Pending tournament submission';

export type ManualTournamentFinalizationStatus =
    | 'published'
    | 'merged'
    | 'incomplete'
    | 'ignored';

export interface ManualTournamentFinalizationResult {
    status: ManualTournamentFinalizationStatus;
    competitionId: string;
}

function dateOnly(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const text = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

function venueText(row: Record<string, unknown>): string {
    return [row.venue_name, row.venue_town, row.venue_postcode]
        .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
        .join(' ');
}

function deriveManualEventStatus(row: Record<string, unknown>, now: Date): string {
    const startText = dateOnly(row.start_date);
    if (!startText) return 'unpublished';
    const endText = dateOnly(row.end_date) ?? startText;
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const start = Date.parse(`${startText}T00:00:00Z`);
    const end = Date.parse(`${endText}T00:00:00Z`);

    if (today > end) return 'awaiting_results';
    if (today >= start && today <= end) return 'in_progress';

    const deadlineText = dateOnly(row.entry_deadline);
    if (deadlineText) {
        return today <= Date.parse(`${deadlineText}T00:00:00Z`)
            ? 'entries_open'
            : 'entries_closed';
    }
    return 'upcoming';
}

function dateWindow(startDate: string): { from: string; to: string } {
    const time = Date.parse(`${startDate}T00:00:00Z`);
    const format = (value: number) => new Date(value).toISOString().slice(0, 10);
    return {
        from: format(time - 7 * 86_400_000),
        to: format(time + 7 * 86_400_000),
    };
}

function missing(value: unknown): boolean {
    return value === null
        || value === undefined
        || (typeof value === 'string' && value.trim().length === 0);
}

async function moveEntryFormInspection(
    db: Kysely<any>,
    fromCompetitionId: string,
    toCompetitionId: string,
    now: Date,
): Promise<void> {
    const inspections = await db
        .selectFrom('tournament_sources')
        .select(['id', 'provider'])
        .where('competition_id', '=', fromCompetitionId)
        .where('source_type', '=', 'entry_form')
        .execute();

    for (const inspection of inspections) {
        const existing = await db
            .selectFrom('tournament_sources')
            .select('id')
            .where('competition_id', '=', toCompetitionId)
            .where('provider', '=', inspection.provider)
            .where('source_type', '=', 'entry_form')
            .where('source_key', '=', toCompetitionId)
            .executeTakeFirst();

        if (existing) {
            await db
                .deleteFrom('tournament_sources')
                .where('id', '=', inspection.id)
                .execute();
            continue;
        }

        await db
            .updateTable('tournament_sources')
            .set({
                competition_id: toCompetitionId,
                source_key: toCompetitionId,
                match_method: 'manual-submit-entry-url',
                updated_at: now,
            })
            .where('id', '=', inspection.id)
            .execute();
    }
}

async function mergeIntoExistingCompetition(
    db: Kysely<any>,
    manual: Record<string, any>,
    candidateId: string,
    score: number,
    now: Date,
): Promise<void> {
    const candidate = await db
        .selectFrom('competitions')
        .select([
            'description',
            'start_date',
            'end_date',
            'entry_deadline',
            'entry_url',
            'venue_name',
            'venue_address',
            'venue_town',
            'venue_postcode',
            'organizer_name',
            'category',
            'entry_fee',
            'categories',
        ])
        .where('id', '=', candidateId)
        .executeTakeFirstOrThrow();

    const updates: Record<string, unknown> = {};
    const mergeable = [
        'description',
        'start_date',
        'end_date',
        'entry_deadline',
        'entry_url',
        'venue_name',
        'venue_address',
        'venue_town',
        'venue_postcode',
        'organizer_name',
        'category',
        'entry_fee',
        'categories',
    ] as const;

    for (const field of mergeable) {
        if (missing(candidate[field]) && !missing(manual[field])) {
            updates[field] = manual[field];
        }
    }
    if (Object.keys(updates).length > 0) {
        await db
            .updateTable('competitions')
            .set(updates)
            .where('id', '=', candidateId)
            .execute();
    }

    await db
        .updateTable('tournament_sources')
        .set({
            competition_id: candidateId,
            match_method: 'manual-submit-reconciliation',
            match_confidence: score,
            updated_at: now,
        })
        .where('competition_id', '=', manual.id)
        .where('provider', '=', MANUAL_SOURCE)
        .where('source_type', '=', 'submission')
        .execute();

    await moveEntryFormInspection(db, manual.id, candidateId, now);

    await db
        .updateTable('competitions')
        .set({ deleted_at: now })
        .where('id', '=', manual.id)
        .execute();
}

export async function finalizeManualTournamentSubmission(
    db: Kysely<any>,
    competitionId: string,
    now: Date = new Date(),
): Promise<ManualTournamentFinalizationResult> {
    const manual = await db
        .selectFrom('competitions')
        .select([
            'id',
            'source',
            'name',
            'display_name',
            'description',
            'start_date',
            'end_date',
            'entry_deadline',
            'entry_url',
            'venue_name',
            'venue_address',
            'venue_town',
            'venue_postcode',
            'organizer_name',
            'category',
            'entry_fee',
            'categories',
            'deleted_at',
        ])
        .where('id', '=', competitionId)
        .executeTakeFirst();

    if (!manual || manual.source !== MANUAL_SOURCE || manual.deleted_at) {
        return { status: 'ignored', competitionId };
    }

    const displayName = typeof manual.display_name === 'string'
        ? manual.display_name.trim()
        : '';
    const startDate = dateOnly(manual.start_date);
    if (!displayName || displayName === PENDING_NAME || !startDate) {
        return { status: 'incomplete', competitionId };
    }

    const window = dateWindow(startDate);
    const candidates = await db
        .selectFrom('competitions')
        .select([
            'id',
            'name',
            'display_name',
            'start_date',
            'end_date',
            'venue_name',
            'venue_town',
            'venue_postcode',
            'category',
        ])
        .where('id', '!=', competitionId)
        .where('type', '=', 'individual')
        .where('record_kind', '=', 'calendar')
        .where('deleted_at', 'is', null)
        .where('event_status', '!=', 'unpublished')
        .where('start_date', '>=', window.from)
        .where('start_date', '<=', window.to)
        .execute();

    const choice = chooseTournamentCandidate(
        {
            name: displayName,
            startDate,
            endDate: dateOnly(manual.end_date),
            venue: venueText(manual),
            category: manual.category,
        },
        candidates.map((candidate: Record<string, any>) => ({
            id: candidate.id,
            name: candidate.display_name ?? candidate.name,
            startDate: dateOnly(candidate.start_date),
            endDate: dateOnly(candidate.end_date),
            venue: venueText(candidate),
            category: candidate.category,
        })),
    );

    if (choice.decision === 'automatic' && choice.candidate && choice.score) {
        await db.transaction().execute(async (trx) => {
            await mergeIntoExistingCompetition(
                trx,
                manual,
                choice.candidate!.id,
                choice.score!.total,
                now,
            );
        });
        return { status: 'merged', competitionId: choice.candidate.id };
    }

    await db
        .updateTable('competitions')
        .set({
            name: displayName,
            event_date: startDate,
            normalized_name: normalizeTournamentName(displayName),
            normalized_venue: normalizeVenue(venueText(manual)),
            event_status: deriveManualEventStatus(manual, now),
            calendar_last_seen_at: now,
        })
        .where('id', '=', competitionId)
        .execute();

    return { status: 'published', competitionId };
}
