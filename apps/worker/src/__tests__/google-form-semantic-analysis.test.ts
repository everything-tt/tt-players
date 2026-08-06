import { describe, expect, it, vi } from 'vitest';
import {
    analyzeGoogleFormSemantics,
    entryFormSemanticAnalysisConfiguration,
    entryFormSemanticAnalysisKey,
    type EntryFormSemanticAnalysisConfiguration,
} from '../google-form-semantic-analysis.js';
import type { GoogleFormInspection } from '../google-forms.js';

const configuration: EntryFormSemanticAnalysisConfiguration = {
    baseUrl: 'http://127.0.0.1:8000/v1',
    apiKey: 'test-key',
    model: 'google/gemma-4-E4B-it',
    timeoutMs: 5_000,
};

const form: GoogleFormInspection = {
    provider: 'google_forms',
    form_url: 'https://docs.google.com/forms/d/e/form-id/viewform',
    title: 'Junior Open Entry',
    public_text: [
        'Junior Open Entry Closing date: 2 August 2026 at 5pm.',
        'Venue: Rowhedge Village Hall, CO5 7HL.',
        'Payment via BACS. Account number: 12345678. Sort code: 12-34-56.',
    ].join(' '),
    fields: [
        {
            id: 'emailAddress',
            label: 'Email',
            description: 'Contact email for this entry',
            kind: 'short_text',
            required: true,
            options: [],
            prefill_parameter: 'emailAddress',
        },
        {
            id: '2',
            label: 'Medical information',
            description: 'Tell us about any conditions',
            kind: 'paragraph',
            required: false,
            options: [],
        },
        {
            id: '3',
            label: 'Venue',
            description: 'Rowhedge Village Hall, CO5 7HL',
            kind: 'short_text',
            required: false,
            options: [],
        },
    ],
};

function completion(content: unknown): Response {
    return new Response(JSON.stringify({
        choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }],
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('Google Form semantic analysis', () => {
    it('is disabled unless an endpoint is configured', () => {
        expect(entryFormSemanticAnalysisConfiguration({})).toBeNull();
        expect(entryFormSemanticAnalysisKey(null)).toBeNull();
    });

    it('validates mappings, blocks sensitive fields and retains evidence-backed enrichment', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => completion({
            mappings: [
                {
                    field_id: 'emailAddress',
                    profile_field: 'guardianEmail',
                    confidence: 0.96,
                    reason: 'Junior entry contact email',
                },
                {
                    field_id: '2',
                    profile_field: 'entrantName',
                    confidence: 0.99,
                    reason: 'Incorrect model mapping that must be blocked',
                },
                {
                    field_id: 'invented',
                    profile_field: 'club',
                    confidence: 0.99,
                    reason: 'Invented ID',
                },
            ],
            event_details: [
                {
                    field: 'venue_postcode',
                    value: 'CO5 7HL',
                    confidence: 0.95,
                    evidence: 'Rowhedge Village Hall, CO5 7HL',
                    source_field_ids: ['3'],
                },
                {
                    field: 'entry_deadline',
                    value: '2026-08-02',
                    confidence: 0.97,
                    evidence: 'Closing date: 2 August 2026 at 5pm.',
                    source_field_ids: [],
                },
                {
                    field: 'description',
                    value: 'Payment via BACS using account number 12345678.',
                    confidence: 0.99,
                    evidence: 'Payment via BACS. Account number: 12345678.',
                    source_field_ids: [],
                },
                {
                    field: 'venue_town',
                    value: 'Rowhedge',
                    confidence: 0.95,
                    evidence: 'Invented source',
                    source_field_ids: ['invented'],
                },
                {
                    field: 'organizer_name',
                    value: 'Made Up Organiser',
                    confidence: 0.99,
                    evidence: 'Rowhedge Village Hall, CO5 7HL',
                    source_field_ids: ['3'],
                },
            ],
        }));

        const analysis = await analyzeGoogleFormSemantics(form, {
            competition_name: 'Junior Open',
        }, {
            configuration,
            fetcher,
            now: new Date('2026-08-06T20:00:00.000Z'),
        });

        expect(analysis).toMatchObject({
            status: 'ready',
            model: 'google/gemma-4-E4B-it',
            analysis_key: expect.stringContaining('google/gemma-4-E4B-it'),
            analyzed_at: '2026-08-06T20:00:00.000Z',
            mappings: [
                expect.objectContaining({ field_id: 'emailAddress', profile_field: 'guardianEmail' }),
                expect.objectContaining({ field_id: '2', profile_field: null }),
            ],
            event_details: [
                expect.objectContaining({ field: 'venue_postcode', value: 'CO5 7HL' }),
                expect.objectContaining({ field: 'entry_deadline', value: '2026-08-02' }),
            ],
            error_message: null,
        });
        expect(analysis?.mappings.some((mapping) => mapping.field_id === 'invented')).toBe(false);
        expect(analysis?.event_details.some((detail) => detail.field === 'description')).toBe(false);
        expect(analysis?.event_details.some((detail) => detail.field === 'venue_town')).toBe(false);
        expect(analysis?.event_details.some((detail) => detail.field === 'organizer_name')).toBe(false);

        expect(fetcher).toHaveBeenCalledOnce();
        const [url, request] = fetcher.mock.calls[0];
        expect(String(url)).toBe('http://127.0.0.1:8000/v1/chat/completions');
        expect((request?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
        const body = JSON.parse(String(request?.body));
        expect(body.model).toBe('google/gemma-4-E4B-it');
        expect(body.temperature).toBe(0);
        expect(JSON.stringify(body)).toContain('Closing date: 2 August 2026 at 5pm.');
        expect(JSON.stringify(body)).not.toContain('parent@example.test');
    });

    it('records a failed semantic analysis without throwing', async () => {
        const analysis = await analyzeGoogleFormSemantics(form, {}, {
            configuration,
            fetcher: async () => completion('not json'),
            now: new Date('2026-08-06T20:00:00.000Z'),
        });

        expect(analysis).toMatchObject({
            status: 'failed',
            mappings: [],
            event_details: [],
            error_message: 'LLM response was not valid JSON',
        });
    });
});
