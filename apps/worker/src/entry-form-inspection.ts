import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import {
    GoogleFormInspectionError,
    inspectGoogleForm,
    isGoogleFormUrl,
    normalizeGoogleFormUrl,
    type GoogleFormInspection,
} from './google-forms.js';

const ENTRY_FORM_INSPECTION_VERSION = 2 as const;

export type EntryFormInspectionStatus = 'ready' | 'failed';

export interface CachedEntryFormInspection {
    version: typeof ENTRY_FORM_INSPECTION_VERSION;
    provider: 'google_forms';
    status: EntryFormInspectionStatus;
    source_url: string;
    inspected_at: string;
    fingerprint: string | null;
    form: GoogleFormInspection | null;
    error_code: string | null;
    error_message: string | null;
}

export type EntryFormInspector = (url: string) => Promise<GoogleFormInspection>;
export type EntryFormInspectionOutcome = 'ready' | 'failed' | 'unsupported' | 'unchanged';

interface SyncEntryFormInspectionOptions {
    inspector?: EntryFormInspector;
    force?: boolean;
}

export interface InspectPendingEntryFormsOptions extends SyncEntryFormInspectionOptions {
    limit?: number;
    now?: Date;
}

export interface InspectPendingEntryFormsSummary {
    candidates: number;
    ready: number;
    failed: number;
    unsupported: number;
    unchanged: number;
}

function inspectionFingerprint(inspection: GoogleFormInspection): string {
    return createHash('sha256')
        .update(JSON.stringify({
            provider: inspection.provider,
            form_url: inspection.form_url,
            title: inspection.title,
            fields: inspection.fields,
        }))
        .digest('hex');
}

function cachedInspectionVersion(value: unknown): number | null {
    if (!value || typeof value !== 'object') return null;
    const version = (value as Record<string, unknown>).version;
    return typeof version === 'number' ? version : null;
}

function failureCode(error: unknown): string {
    if (error instanceof GoogleFormInspectionError) {
        if (error.statusCode === 400) return 'invalid_google_form_url';
        if (error.statusCode === 422) return 'form_not_publicly_inspectable';
        return 'google_forms_unavailable';
    }
    return 'inspection_failed';
}

function failureMessage(error: unknown): string {
    if (error instanceof Error && error.message.trim()) return error.message.slice(0, 500);
    return 'The Google Form could not be inspected during event ingestion.';
}

async function removeStaleInspection(db: Kysely<any>, competitionId: string): Promise<void> {
    await db
        .deleteFrom('tournament_sources')
        .where('provider', '=', 'google_forms')
        .where('source_type', '=', 'entry_form')
        .where('source_key', '=', competitionId)
        .execute();
}

async function persistInspection(
    db: Kysely<any>,
    competitionId: string,
    sourceUrl: string,
    payload: CachedEntryFormInspection,
    now: Date,
): Promise<void> {
    await db
        .insertInto('tournament_sources')
        .values({
            competition_id: competitionId,
            provider: 'google_forms',
            source_type: 'entry_form',
            external_id: null,
            source_url: sourceUrl,
            source_key: competitionId,
            payload_hash: payload.fingerprint,
            raw_payload: payload,
            first_seen_at: now,
            last_seen_at: now,
            missing_count: 0,
            match_method: 'competition-entry-url',
            match_confidence: 1,
            created_at: now,
            updated_at: now,
        })
        .onConflict((conflict) => conflict
            .columns(['provider', 'source_type', 'source_key'])
            .doUpdateSet({
                competition_id: competitionId,
                source_url: sourceUrl,
                payload_hash: payload.fingerprint,
                raw_payload: payload,
                last_seen_at: now,
                missing_count: 0,
                updated_at: now,
            }))
        .execute();
}

export async function syncTournamentEntryFormInspection(
    db: Kysely<any>,
    competitionId: string,
    entryUrl: string | null | undefined,
    now: Date = new Date(),
    options: SyncEntryFormInspectionOptions = {},
): Promise<EntryFormInspectionOutcome> {
    if (!isGoogleFormUrl(entryUrl)) {
        await removeStaleInspection(db, competitionId);
        return 'unsupported';
    }

    const sourceUrl = normalizeGoogleFormUrl(entryUrl!).toString();
    const existing = await db
        .selectFrom('tournament_sources')
        .select(['source_url', 'raw_payload'])
        .where('provider', '=', 'google_forms')
        .where('source_type', '=', 'entry_form')
        .where('source_key', '=', competitionId)
        .executeTakeFirst();

    if (
        !options.force
        && existing?.source_url === sourceUrl
        && cachedInspectionVersion(existing.raw_payload) === ENTRY_FORM_INSPECTION_VERSION
    ) {
        return 'unchanged';
    }

    const inspector = options.inspector ?? inspectGoogleForm;
    try {
        const form = await inspector(sourceUrl);
        const fingerprint = inspectionFingerprint(form);
        const payload: CachedEntryFormInspection = {
            version: ENTRY_FORM_INSPECTION_VERSION,
            provider: 'google_forms',
            status: 'ready',
            source_url: sourceUrl,
            inspected_at: now.toISOString(),
            fingerprint,
            form,
            error_code: null,
            error_message: null,
        };
        await persistInspection(db, competitionId, sourceUrl, payload, now);
        return 'ready';
    } catch (error) {
        const payload: CachedEntryFormInspection = {
            version: ENTRY_FORM_INSPECTION_VERSION,
            provider: 'google_forms',
            status: 'failed',
            source_url: sourceUrl,
            inspected_at: now.toISOString(),
            fingerprint: null,
            form: null,
            error_code: failureCode(error),
            error_message: failureMessage(error),
        };
        await persistInspection(db, competitionId, sourceUrl, payload, now);
        return 'failed';
    }
}

export async function inspectPendingTournamentEntryForms(
    db: Kysely<any>,
    options: InspectPendingEntryFormsOptions = {},
): Promise<InspectPendingEntryFormsSummary> {
    const limit = Math.max(1, Math.min(options.limit ?? 500, 5_000));
    const now = options.now ?? new Date();
    const candidates = await db
        .selectFrom('competitions')
        .select(['id', 'entry_url'])
        .where('type', '=', 'individual')
        .where('deleted_at', 'is', null)
        .where('entry_url', 'is not', null)
        .where('event_status', 'in', ['upcoming', 'entries_open', 'entries_closed', 'in_progress'])
        .orderBy('start_date', 'asc')
        .limit(limit)
        .execute();

    const summary: InspectPendingEntryFormsSummary = {
        candidates: candidates.length,
        ready: 0,
        failed: 0,
        unsupported: 0,
        unchanged: 0,
    };

    for (const candidate of candidates) {
        const outcome = await syncTournamentEntryFormInspection(
            db,
            candidate.id,
            candidate.entry_url,
            now,
            { inspector: options.inspector, force: options.force },
        );
        summary[outcome] += 1;
    }

    return summary;
}
