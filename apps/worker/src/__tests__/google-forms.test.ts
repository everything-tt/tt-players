import { describe, expect, it, vi } from 'vitest';
import {
    GoogleFormInspectionError,
    extractGoogleFormLoadData,
    inspectGoogleForm,
    isGoogleFormUrl,
    normalizeGoogleFormUrl,
    parseGoogleFormHtml,
} from '../google-forms.js';

const FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLTestForm/viewform?usp=sf_link';

function formHtml(
    payload: unknown,
    title = 'Junior Entry - Google Forms',
    body = '',
): string {
    return `<!doctype html>
<html>
<head><title>${title}</title></head>
<body>
${body}
<script>var FB_PUBLIC_LOAD_DATA_ = ${JSON.stringify(payload)};</script>
</body>
</html>`;
}

describe('Google Forms ingestion inspection', () => {
    it('normalises supported links and strips pre-filled query values', () => {
        expect(normalizeGoogleFormUrl(`${FORM_URL}&entry.123=Private+Value`).toString())
            .toBe('https://docs.google.com/forms/d/e/1FAIpQLTestForm/viewform');
        expect(normalizeGoogleFormUrl('https://forms.gle/abc123?secret=value').toString())
            .toBe('https://forms.gle/abc123');
        expect(isGoogleFormUrl(FORM_URL)).toBe(true);
        expect(isGoogleFormUrl('https://example.com/form')).toBe(false);
    });

    it('rejects non-Google and non-public form paths', () => {
        expect(() => normalizeGoogleFormUrl('https://example.com/form')).toThrow(GoogleFormInspectionError);
        expect(() => normalizeGoogleFormUrl('https://docs.google.com/forms/d/example/not-a-form-path')).toThrow(
            'Only public Google Forms links are supported.',
        );
    });

    it('canonicalizes editor links to public view links before fetching', async () => {
        const editUrl = 'https://docs.google.com/forms/d/13myTIRN8pp-N02pzlMhNO5V1QTF0Cpj8SmBYyrtgDBs/edit?edit_requested=true';
        const viewUrl = 'https://docs.google.com/forms/d/13myTIRN8pp-N02pzlMhNO5V1QTF0Cpj8SmBYyrtgDBs/viewform';
        expect(normalizeGoogleFormUrl(editUrl).toString()).toBe(viewUrl);
        expect(isGoogleFormUrl(editUrl)).toBe(true);

        const payload = [null, [null, [[101, 'Player name', null, 0, [[501, null, 1]]]]]];
        const fetcher = vi.fn<typeof fetch>(async () => new Response(formHtml(payload), {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        }));

        const inspection = await inspectGoogleForm(editUrl, fetcher);
        expect(String(fetcher.mock.calls[0]?.[0])).toBe(viewUrl);
        expect(inspection.form_url).toBe(viewUrl);
    });

    it('extracts the balanced public data assignment', () => {
        const payload = [null, [null, [[101, 'Name with ] bracket', null, 0, [[501, null, 1]]]]]];
        expect(extractGoogleFormLoadData(formHtml(payload))).toEqual(payload);
    });

    it('extracts text, date and choice questions with entry IDs', () => {
        const payload = [
            null,
            [
                null,
                [
                    [101, 'Player name', 'Use the registered name', 0, [[501, null, 1]]],
                    [102, 'Date of birth', null, 9, [[502, null, 1]]],
                    [103, 'Event category', null, 2, [[503, [['Under 13'], ['Under 15']], 1]]],
                ],
            ],
        ];

        const inspection = parseGoogleFormHtml(formHtml(payload), FORM_URL);

        expect(inspection).toEqual({
            provider: 'google_forms',
            form_url: 'https://docs.google.com/forms/d/e/1FAIpQLTestForm/viewform',
            title: 'Junior Entry',
            public_text: null,
            fields: [
                {
                    id: '501',
                    label: 'Player name',
                    description: 'Use the registered name',
                    kind: 'short_text',
                    required: true,
                    options: [],
                },
                {
                    id: '502',
                    label: 'Date of birth',
                    description: null,
                    kind: 'date',
                    required: true,
                    options: [],
                },
                {
                    id: '503',
                    label: 'Event category',
                    description: null,
                    kind: 'multiple_choice',
                    required: true,
                    options: ['Under 13', 'Under 15'],
                },
            ],
        });
    });

    it('captures visible blank-form text while excluding scripts and markup', () => {
        const payload = [null, [null, [[101, 'Player name', null, 0, [[501, null, 1]]]]]];
        const html = formHtml(
            payload,
            'Junior Open - Google Forms',
            '<h1>Junior Open</h1><p>Closing date: 2 August 2026 at 5pm.</p><div>Venue: Rowhedge &amp; District Hall</div>',
        );

        const inspection = parseGoogleFormHtml(html, FORM_URL);

        expect(inspection.public_text).toBe(
            'Junior Open Closing date: 2 August 2026 at 5pm. Venue: Rowhedge & District Hall',
        );
        expect(inspection.public_text).not.toContain('FB_PUBLIC_LOAD_DATA_');
    });

    it('extracts Google Forms responder email as a prefillable field', () => {
        const payload = [null, [null, [[101, '4. Email', null, 0, [[501, null, 1]]]]]];
        const html = formHtml(
            payload,
            'Junior Entry - Google Forms',
            '<input type="email" name="emailAddress" required>',
        );

        const inspection = parseGoogleFormHtml(html, FORM_URL);

        expect(inspection.fields).toEqual([
            {
                id: 'emailAddress',
                label: 'Email',
                description: 'Email address used by Google Forms for this response',
                kind: 'short_text',
                required: true,
                options: [],
                prefill_parameter: 'emailAddress',
            },
            {
                id: '501',
                label: '4. Email',
                description: null,
                kind: 'short_text',
                required: true,
                options: [],
            },
        ]);
    });

    it('fails closed when no supported question entries are present', () => {
        expect(() => parseGoogleFormHtml(formHtml([null, [null, []]]), FORM_URL)).toThrow(
            'No supported questions were found in this form.',
        );
    });
});
