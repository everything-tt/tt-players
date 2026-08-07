import { describe, expect, it, vi } from 'vitest';
import {
    analyzeGoogleFormSemantics,
    analyzeDocumentSemantics,
    entryFormSemanticAnalysisConfiguration,
    entryFormSemanticAnalysisKey,
    type EntryFormSemanticAnalysisConfiguration,
} from '../google-form-semantic-analysis.js';
import type { GoogleFormInspection } from '../google-forms.js';

const configuration: EntryFormSemanticAnalysisConfiguration = {
    baseUrl: 'https://api.deepseek.com',
    apiKey: 'test-key',
    model: 'deepseek-v4-flash',
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

function ollamaCompletion(content: unknown): Response {
    return new Response(JSON.stringify({
        model: 'deepseek-v4-flash:0731',
        message: { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) },
        done: true,
    }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

describe('Google Form semantic analysis', () => {
    it('is disabled unless an endpoint or DeepSeek key is configured', () => {
        expect(entryFormSemanticAnalysisConfiguration({})).toBeNull();
        expect(entryFormSemanticAnalysisKey(null)).toBeNull();
    });

    it('uses the Ollama defaults when an API key is configured', () => {
        expect(entryFormSemanticAnalysisConfiguration({
            OLLAMA_API_KEY: 'ollama-secret',
        })).toEqual({
            baseUrl: 'https://api.ollama.com',
            apiKey: 'ollama-secret',
            model: 'deepseek-v4-flash:0731',
            timeoutMs: 60_000,
        });
    });

    it('keeps DEEPSEEK_API_KEY as a compatibility fallback', () => {
        expect(entryFormSemanticAnalysisConfiguration({
            DEEPSEEK_API_KEY: 'deepseek-secret',
        })).toEqual({
            baseUrl: 'https://api.ollama.com',
            apiKey: 'deepseek-secret',
            model: 'deepseek-v4-flash:0731',
            timeoutMs: 60_000,
        });
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
            model: 'deepseek-v4-flash',
            analysis_key: expect.stringContaining('deepseek-v4-flash'),
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
        expect(String(url)).toBe('https://api.deepseek.com/v1/chat/completions');
        expect((request?.headers as Record<string, string>).Authorization).toBe('Bearer test-key');
        const body = JSON.parse(String(request?.body));
        expect(body.model).toBe('deepseek-v4-flash');
        expect(body.thinking).toEqual({ type: 'disabled' });
        expect(body.temperature).toBe(0);
        expect(body.stream).toBe(false);
        expect(body.response_format).toEqual({ type: 'json_object' });
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

    it('uses the Ollama native chat endpoint with JSON mode and parses native responses', async () => {
        const ollamaConfiguration: EntryFormSemanticAnalysisConfiguration = {
            baseUrl: 'https://api.ollama.com',
            apiKey: 'ollama-key',
            model: 'deepseek-v4-flash:0731',
            timeoutMs: 5_000,
        };
        const fetcher = vi.fn<typeof fetch>(async () => ollamaCompletion({
            mappings: [
                {
                    field_id: 'emailAddress',
                    profile_field: 'guardianEmail',
                    confidence: 0.96,
                    reason: 'Junior entry contact email',
                },
            ],
            event_details: [],
        }));

        const analysis = await analyzeGoogleFormSemantics(form, {}, {
            configuration: ollamaConfiguration,
            fetcher,
            now: new Date('2026-08-06T20:00:00.000Z'),
        });

        expect(analysis).toMatchObject({
            status: 'ready',
            model: 'deepseek-v4-flash:0731',
            error_message: null,
        });
        expect(analysis?.mappings[0]).toMatchObject({
            field_id: 'emailAddress',
            profile_field: 'guardianEmail',
        });

        const [url, request] = fetcher.mock.calls[0];
        expect(String(url)).toBe('https://api.ollama.com/api/chat');
        expect((request?.headers as Record<string, string>).Authorization).toBe('Bearer ollama-key');
        const body = JSON.parse(String(request?.body));
        expect(body.model).toBe('deepseek-v4-flash:0731');
        expect(body.format).toBe('json');
        expect(body.think).toBe(false);
        expect(body.options).toEqual({ temperature: 0, num_predict: 4_096 });
        expect(body.stream).toBe(false);
        expect(body.thinking).toBeUndefined();
        expect(body.max_tokens).toBeUndefined();
        expect(body.response_format).toBeUndefined();
    });

    it('extracts event details from a PDF document via the Ollama endpoint', async () => {
        const pdfConfiguration: EntryFormSemanticAnalysisConfiguration = {
            baseUrl: 'https://api.ollama.com',
            apiKey: 'ollama-key',
            model: 'deepseek-v4-flash:0731',
            timeoutMs: 5_000,
        };
        const document = {
            form_url: 'https://example.com/entry-form.pdf',
            title: 'Nottingham Veterans 2*',
            text: 'CLOSING DATE FOR ENTRIES: Friday 14th August 2026. Venue: Nottingham TTC. Entry fee: £25.',
        };
        const fetcher = vi.fn<typeof fetch>(async () => ollamaCompletion({
            event_details: [
                {
                    field: 'entry_deadline',
                    value: '2026-08-14',
                    confidence: 0.97,
                    evidence: 'CLOSING DATE FOR ENTRIES: Friday 14th August 2026',
                    source_field_ids: [],
                },
                {
                    field: 'venue_name',
                    value: 'Nottingham TTC',
                    confidence: 0.95,
                    evidence: 'Venue: Nottingham TTC',
                    source_field_ids: [],
                },
                {
                    field: 'entry_fee',
                    value: '£25',
                    confidence: 0.9,
                    evidence: 'Entry fee: £25',
                    source_field_ids: [],
                },
            ],
        }));

        const analysis = await analyzeDocumentSemantics(document, {}, {
            configuration: pdfConfiguration,
            fetcher,
            now: new Date('2026-08-07T00:00:00.000Z'),
        });

        expect(analysis).toMatchObject({
            status: 'ready',
            model: 'deepseek-v4-flash:0731',
            prompt_version: '2026-08-07.3',
            mappings: [],
            error_message: null,
        });
        expect(analysis?.event_details.map((detail) => detail.field))
            .toEqual(['entry_deadline', 'venue_name', 'entry_fee']);

        const [url, request] = fetcher.mock.calls[0];
        expect(String(url)).toBe('https://api.ollama.com/api/chat');
        const body = JSON.parse(String(request?.body));
        expect(body.model).toBe('deepseek-v4-flash:0731');
        expect(body.format).toBe('json');
        expect(body.think).toBe(false);
        expect(JSON.stringify(body)).toContain('CLOSING DATE FOR ENTRIES');
    });

    it('drops event details with null values instead of failing the analysis', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => ollamaCompletion({
            event_details: [
                {
                    field: 'venue_name',
                    value: 'Nottingham TTC',
                    confidence: 0.95,
                    evidence: 'Venue: Nottingham TTC',
                    source_field_ids: [],
                },
                {
                    field: 'entry_fee',
                    value: null,
                    confidence: 0.9,
                    evidence: 'Entry fee: £25',
                    source_field_ids: [],
                },
            ],
        }));

        const analysis = await analyzeDocumentSemantics({
            form_url: 'https://example.com/entry-form.pdf',
            title: 'Nottingham Veterans 2*',
            text: 'Venue: Nottingham TTC. Entry fee: £25.',
        }, {}, {
            configuration: {
                baseUrl: 'https://api.ollama.com',
                apiKey: 'ollama-key',
                model: 'deepseek-v4-flash:0731',
                timeoutMs: 5_000,
            },
            fetcher,
            now: new Date('2026-08-07T00:00:00.000Z'),
        });

        expect(analysis).toMatchObject({ status: 'ready', error_message: null });
        expect(analysis?.event_details.map((detail) => detail.field)).toEqual(['venue_name']);
    });

    it('defaults missing source_field_ids and drops details without evidence', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => ollamaCompletion({
            event_details: [
                {
                    field: 'venue_name',
                    value: 'Nottingham TTC',
                    confidence: 0.95,
                    evidence: 'Venue: Nottingham TTC',
                },
                {
                    field: 'entry_fee',
                    value: '£25',
                    confidence: 0.9,
                    evidence: '',
                },
            ],
        }));

        const analysis = await analyzeDocumentSemantics({
            form_url: 'https://example.com/entry-form.pdf',
            title: 'Nottingham Veterans 2*',
            text: 'Venue: Nottingham TTC. Entry fee: £25.',
        }, {}, {
            configuration: {
                baseUrl: 'https://api.ollama.com',
                apiKey: 'ollama-key',
                model: 'deepseek-v4-flash:0731',
                timeoutMs: 5_000,
            },
            fetcher,
            now: new Date('2026-08-07T00:00:00.000Z'),
        });

        expect(analysis).toMatchObject({ status: 'ready', error_message: null });
        expect(analysis?.event_details).toEqual([
            expect.objectContaining({ field: 'venue_name', value: 'Nottingham TTC', source_field_ids: [] }),
        ]);
    });
});
