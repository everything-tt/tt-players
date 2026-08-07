import { describe, expect, it } from 'vitest';
import { diagnosticsFromCachedEntryForm } from '../entry-form-backfill-diagnostics.js';

const context = {
    competitionId: 'competition-1',
    competitionName: 'Example Open',
    sourceUrl: 'https://docs.google.com/forms/d/e/example/viewform',
};

describe('diagnosticsFromCachedEntryForm', () => {
    it('reports a cached Google Form inspection-pipeline failure', () => {
        expect(diagnosticsFromCachedEntryForm({
            status: 'failed',
            source_url: context.sourceUrl,
            inspected_at: '2026-08-07T00:00:00.000Z',
            error_code: 'form_not_publicly_inspectable',
            error_message: 'This Google Form requires access and cannot be inspected.',
            semantic_analysis: null,
        }, context)).toEqual([{
            competition_id: 'competition-1',
            competition_name: 'Example Open',
            source_url: context.sourceUrl,
            inspected_at: '2026-08-07T00:00:00.000Z',
            stage: 'inspection_pipeline',
            model: null,
            error_code: 'form_not_publicly_inspectable',
            error_message: 'This Google Form requires access and cannot be inspected.',
        }]);
    });

    it('reports a DeepSeek semantic-analysis failure independently', () => {
        expect(diagnosticsFromCachedEntryForm({
            status: 'ready',
            source_url: context.sourceUrl,
            inspected_at: '2026-08-07T00:00:00.000Z',
            error_code: null,
            error_message: null,
            semantic_analysis: {
                status: 'failed',
                model: 'deepseek-v4-flash',
                analyzed_at: '2026-08-07T00:00:01.000Z',
                error_message: 'Semantic form analysis returned HTTP 401',
            },
        }, context)).toEqual([{
            competition_id: 'competition-1',
            competition_name: 'Example Open',
            source_url: context.sourceUrl,
            inspected_at: '2026-08-07T00:00:01.000Z',
            stage: 'semantic_analysis',
            model: 'deepseek-v4-flash',
            error_code: 'semantic_analysis_failed',
            error_message: 'Semantic form analysis returned HTTP 401',
        }]);
    });

    it('returns no diagnostics for a fully ready cached inspection', () => {
        expect(diagnosticsFromCachedEntryForm({
            status: 'ready',
            semantic_analysis: {
                status: 'ready',
                model: 'deepseek-v4-flash',
                error_message: null,
            },
        }, context)).toEqual([]);
    });

    it('normalizes and bounds diagnostic messages', () => {
        const diagnostics = diagnosticsFromCachedEntryForm({
            status: 'failed',
            error_message: `  first line\nsecond line ${'x'.repeat(600)}  `,
        }, context);

        expect(diagnostics[0]?.error_message).not.toContain('\n');
        expect(diagnostics[0]?.error_message.length).toBe(500);
    });
});
