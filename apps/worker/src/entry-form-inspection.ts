import { createHash } from 'node:crypto';
import type { Kysely } from 'kysely';
import {
    GoogleFormInspectionError,
    inspectGoogleForm,
    isGoogleFormUrl,
    normalizeGoogleFormUrl,
    type GoogleFormInspection,
} from './google-forms.js';
import {
    analyzeGoogleFormSemantics,
    entryFormSemanticAnalysisKey,
    ENTRY_FORM_EVENT_ENRICHMENT_CONFIDENCE,
    type EntryFormEventDetail,
    type EntryFormSemanticAnalysis,
    type EntryFormSemanticAnalyzer,
    type EntryFormSemanticContext,
} from './google-form-semantic-analysis.js';

const ENTRY_FORM_INSPECTION_VERSION = 3 as const;

export type EntryFormInspectionStatus = 'ready' | 'failed';

export interface CachedEntryFormInspection {
    version: typeof ENTRY_FORM_INSPECTION_VERSION;
    provider: 'google_forms';
    status: EntryFormInspectionStatus;
    source_url: string;
    inspected_at: string;
    fingerprint: string | null;
    form: GoogleFormInspection | null;
    semantic_analysis: EntryFormSemanticAnalysis | null;
    error_code: string | null;
    error_message: string | null;
}

export type EntryFormInspector = (url: string) => Promise<GoogleFormInspection>;
export type EntryFormInspectionOutcome = 'ready' | 'failed' | 'unsupported' | 'unchanged';

interface SyncEntryFormInspectionOptions {
    inspector?: EntryFormInspector;
    semanticAnalyzer?: EntryFormSemanticAnalyzer | null;
    semanticAnalysisKey?: string | null;
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

function cachedSemanticAnalysisKey(value: unknown): string | null {
    if (!value || typeof value !== 'object') return null;
    const semanticAnalysis = (value as Record<string, unknown>).semantic_analysis;
    if (!semanticAnalysis || typeof semanticAnalysis !== 'object') return null;
    const analysisKey = (semanticAnalysis as Record<string, unknown>).analysis_key;
    return typeof analysisKey === 'string' && analysisKey.trim() ? analysisKey : null;
}

function expectedSemanticAnalysisKey(options: SyncEntryFormInspectionOptions): string | null {
    if (options.semanticAnalysisKey !== undefined) return options.semanticAnalysisKey;
    if (options.semanticAnalyzer === null) return null;
    if (options.semanticAnalyzer) return 'custom-entry-form-semantic-analyzer';
    return entryFormSemanticAnalysisKey();
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

function dateString(value: unknown): string | null {
    if (!value) return null;
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    const candidate = String(value).slice(0, 10);
    return /^\d{4}-\d{2}-\d{2}$/.test(candidate) ? candidate : null;
}

async function semanticContext(
    db: Kysely<any>,
    competitionId: string,
): Promise<EntryFormSemanticContext> {
    const competition = await db
        .selectFrom('competitions')
        .select([
            'name',
            'display_name',
            'start_date',
            'end_date',
            'entry_deadline',
            'venue_name',
            'venue_address',
            'venue_town',
            'venue_postcode',
            'organizer_name',
            'category',
        ])
        .where('id', '=', competitionId)
        .executeTakeFirst();

    if (!competition) return {};
    return {
        competition_name: competition.display_name ?? competition.name,
        start_date: dateString(competition.start_date),
        end_date: dateString(competition.end_date),
        entry_deadline: dateString(competition.entry_deadline),
        venue_name: competition.venue_name,
        venue_address: competition.venue_address,
        venue_town: competition.venue_town,
        venue_postcode: competition.venue_postcode,
        organizer_name: competition.organizer_name,
        category: competition.category,
    };
}

function usableText(value: string, maximumLength: number): string | null {
    const trimmed = value.trim();
    if (!trimmed) return null;
    return trimmed.slice(0, maximumLength);
}

function validIsoDate(value: string): string | null {
    const trimmed = value.trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return null;
    const parsed = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) return null;
    return trimmed;
}

function bestEventDetails(analysis: EntryFormSemanticAnalysis): Map<EntryFormEventDetail['field'], EntryFormEventDetail> {
    const details = new Map<EntryFormEventDetail['field'], EntryFormEventDetail>();
    if (analysis.status !== 'ready') return details;
    for (const detail of analysis.event_details) {
        if (detail.confidence < ENTRY_FORM_EVENT_ENRICHMENT_CONFIDENCE) continue;
        const current = details.get(detail.field);
        if (!current || current.confidence < detail.confidence) details.set(detail.field, detail);
    }
    return details;
}

function missing(value: unknown): boolean {
    return value === null || value === undefined || (typeof value === 'string' && !value.trim());
}

async function applySemanticEventEnrichment(
    db: Kysely<any>,
    competitionId: string,
    analysis: EntryFormSemanticAnalysis | null,
): Promise<void> {
    if (!analysis || analysis.status !== 'ready') return;
    const details = bestEventDetails(analysis);
    if (details.size === 0) return;

    const competition = await db
        .selectFrom('competitions')
        .select([
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
        ])
        .where('id', '=', competitionId)
        .executeTakeFirst();
    if (!competition) return;

    const updates: Record<string, unknown> = {};
    const textFields: Array<{
        field: EntryFormEventDetail['field'];
        column: keyof typeof competition;
        maximumLength: number;
    }> = [
        { field: 'display_name', column: 'display_name', maximumLength: 500 },
        { field: 'description', column: 'description', maximumLength: 2_000 },
        { field: 'venue_name', column: 'venue_name', maximumLength: 500 },
        { field: 'venue_address', column: 'venue_address', maximumLength: 1_000 },
        { field: 'venue_town', column: 'venue_town', maximumLength: 250 },
        { field: 'venue_postcode', column: 'venue_postcode', maximumLength: 20 },
        { field: 'organizer_name', column: 'organizer_name', maximumLength: 500 },
        { field: 'category', column: 'category', maximumLength: 500 },
    ];

    for (const item of textFields) {
        const detail = details.get(item.field);
        if (!detail || !missing(competition[item.column])) continue;
        const value = usableText(detail.value, item.maximumLength);
        if (value) updates[item.column] = value;
    }

    const startDate = details.get('start_date');
    if (startDate && missing(competition.start_date)) {
        const value = validIsoDate(startDate.value);
        if (value) updates.start_date = value;
    }
    const endDate = details.get('end_date');
    if (endDate && missing(competition.end_date)) {
        const value = validIsoDate(endDate.value);
        if (value) updates.end_date = value;
    }
    const entryDeadline = details.get('entry_deadline');
    if (entryDeadline && missing(competition.entry_deadline)) {
        const value = validIsoDate(entryDeadline.value);
        if (value) updates.entry_deadline = new Date(`${value}T23:59:59Z`);
    }

    if (Object.keys(updates).length > 0) {
        await db
            .updateTable('competitions')
            .set(updates)
            .where('id', '=', competitionId)
            .execute();
    }
}

async function runSemanticAnalysis(
    db: Kysely<any>,
    competitionId: string,
    form: GoogleFormInspection,
    options: SyncEntryFormInspectionOptions,
): Promise<EntryFormSemanticAnalysis | null> {
    const analyzer = options.semanticAnalyzer === undefined
        ? analyzeGoogleFormSemantics
        : options.semanticAnalyzer;
    if (!analyzer) return null;
    const analysis = await analyzer(form, await semanticContext(db, competitionId));
    await applySemanticEventEnrichment(db, competitionId, analysis);
    return analysis;
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
    const semanticKey = expectedSemanticAnalysisKey(options);

    if (
        !options.force
        && existing?.source_url === sourceUrl
        && cachedInspectionVersion(existing.raw_payload) === ENTRY_FORM_INSPECTION_VERSION
        && (semanticKey === null || cachedSemanticAnalysisKey(existing.raw_payload) === semanticKey)
    ) {
        return 'unchanged';
    }

    const inspector = options.inspector ?? inspectGoogleForm;
    try {
        const form = await inspector(sourceUrl);
        const fingerprint = inspectionFingerprint(form);
        const semanticAnalysis = await runSemanticAnalysis(db, competitionId, form, options);
        const payload: CachedEntryFormInspection = {
            version: ENTRY_FORM_INSPECTION_VERSION,
            provider: 'google_forms',
            status: 'ready',
            source_url: sourceUrl,
            inspected_at: now.toISOString(),
            fingerprint,
            form,
            semantic_analysis: semanticAnalysis,
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
            semantic_analysis: null,
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
            {
                inspector: options.inspector,
                semanticAnalyzer: options.semanticAnalyzer,
                semanticAnalysisKey: options.semanticAnalysisKey,
                force: options.force,
            },
        );
        summary[outcome] += 1;
    }

    return summary;
}
