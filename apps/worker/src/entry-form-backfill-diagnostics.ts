import type { Kysely } from 'kysely';

export type TournamentEntryFormDiagnosticStage = 'inspection_pipeline' | 'semantic_analysis';

export interface TournamentEntryFormDiagnostic {
    competition_id: string;
    competition_name: string;
    source_url: string | null;
    inspected_at: string | null;
    stage: TournamentEntryFormDiagnosticStage;
    model: string | null;
    error_code: string;
    error_message: string;
}

interface TournamentEntryFormDiagnosticContext {
    competitionId: string;
    competitionName: string;
    sourceUrl: string | null;
}

function record(value: unknown): Record<string, unknown> | null {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;
}

function nonEmptyString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function diagnosticMessage(value: unknown, fallback: string): string {
    return (nonEmptyString(value) ?? fallback)
        .replace(/\s+/g, ' ')
        .slice(0, 500);
}

export function diagnosticsFromCachedEntryForm(
    payload: unknown,
    context: TournamentEntryFormDiagnosticContext,
): TournamentEntryFormDiagnostic[] {
    const cached = record(payload);
    if (!cached) return [];

    const inspectedAt = nonEmptyString(cached.inspected_at);
    const sourceUrl = nonEmptyString(cached.source_url) ?? context.sourceUrl;
    const diagnostics: TournamentEntryFormDiagnostic[] = [];

    if (cached.status === 'failed') {
        diagnostics.push({
            competition_id: context.competitionId,
            competition_name: context.competitionName,
            source_url: sourceUrl,
            inspected_at: inspectedAt,
            stage: 'inspection_pipeline',
            model: null,
            error_code: nonEmptyString(cached.error_code) ?? 'inspection_failed',
            error_message: diagnosticMessage(
                cached.error_message,
                'The Google Form inspection pipeline failed.',
            ),
        });
    }

    const semanticAnalysis = record(cached.semantic_analysis);
    if (semanticAnalysis?.status === 'failed') {
        const model = nonEmptyString(semanticAnalysis.model);
        diagnostics.push({
            competition_id: context.competitionId,
            competition_name: context.competitionName,
            source_url: sourceUrl,
            inspected_at: nonEmptyString(semanticAnalysis.analyzed_at) ?? inspectedAt,
            stage: 'semantic_analysis',
            model,
            error_code: 'semantic_analysis_failed',
            error_message: diagnosticMessage(
                semanticAnalysis.error_message,
                model
                    ? `Semantic form analysis failed using ${model}.`
                    : 'Semantic form analysis failed.',
            ),
        });
    }

    return diagnostics;
}

export async function collectTournamentEntryFormBackfillDiagnostics(
    db: Kysely<any>,
    limit: number,
): Promise<TournamentEntryFormDiagnostic[]> {
    const candidates = await db
        .selectFrom('competitions')
        .select(['id', 'name', 'display_name'])
        .where('type', '=', 'individual')
        .where('deleted_at', 'is', null)
        .where('entry_url', 'is not', null)
        .where('event_status', 'in', ['upcoming', 'entries_open', 'entries_closed', 'in_progress'])
        .orderBy('start_date', 'asc')
        .limit(Math.max(1, Math.min(limit, 5_000)))
        .execute();

    if (candidates.length === 0) return [];

    const sources = await db
        .selectFrom('tournament_sources')
        .select(['source_key', 'source_url', 'raw_payload'])
        .where('provider', '=', 'google_forms')
        .where('source_type', '=', 'entry_form')
        .where('source_key', 'in', candidates.map((candidate) => candidate.id))
        .execute();
    const sourcesByCompetition = new Map(
        sources.map((source) => [source.source_key, source]),
    );

    const diagnostics: TournamentEntryFormDiagnostic[] = [];
    for (const candidate of candidates) {
        const source = sourcesByCompetition.get(candidate.id);
        if (!source) continue;
        diagnostics.push(...diagnosticsFromCachedEntryForm(source.raw_payload, {
            competitionId: candidate.id,
            competitionName: candidate.display_name ?? candidate.name ?? candidate.id,
            sourceUrl: source.source_url,
        }));
    }

    return diagnostics;
}
