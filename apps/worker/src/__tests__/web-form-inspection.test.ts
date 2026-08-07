import { describe, expect, it, vi } from 'vitest';
import {
    inspectWebForm,
    isWebFormUrl,
    WebFormInspectionError,
} from '../web-form-inspection.js';

const HTML = `<!doctype html>
<html>
<head><title>REGISTRATION FORM</title>
<meta property="og:title" content="Limpsfield U13 Open 20th Sep 2026" /></head>
<body>
<h1>Limpsfield U13 Open</h1>
<p>Closing date: 6th September 2026</p>
<p>Venue: The Limpsfield Club, Detillens Lane, Limpsfield, Surrey RH8 0DH</p>
<script>var secret = 'ignored';</script>
<style>.hidden { display: none; }</style>
</body>
</html>`;

describe('Web form inspection', () => {
    it('recognises https form URLs', () => {
        expect(isWebFormUrl('https://app.slotbookings.com/limpsfieldttc/ans-form?id=1')).toBe(true);
        expect(isWebFormUrl('https://example.com/entry')).toBe(true);
        expect(isWebFormUrl('http://example.com/entry')).toBe(false);
        expect(isWebFormUrl(null)).toBe(false);
    });

    it('extracts title and visible text from an HTML form page', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response(HTML, {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        }));

        const inspection = await inspectWebForm('https://app.slotbookings.com/limpsfieldttc/ans-form?id=1', fetcher);

        expect(inspection.provider).toBe('web_form');
        expect(inspection.title).toBe('Limpsfield U13 Open 20th Sep 2026');
        expect(inspection.text).toContain('Closing date: 6th September 2026');
        expect(inspection.text).toContain('The Limpsfield Club');
        expect(inspection.text).not.toContain('secret');
        expect(inspection.text).not.toContain('hidden');
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it('rejects non-HTML responses', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response('not html', {
            status: 200,
            headers: { 'Content-Type': 'application/pdf' },
        }));
        await expect(inspectWebForm('https://example.com/entry', fetcher))
            .rejects.toThrow(WebFormInspectionError);
    });

    it('rejects pages without readable content', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response('<html><body><script>x()</script></body></html>', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        }));
        await expect(inspectWebForm('https://example.com/entry', fetcher))
            .rejects.toThrow('No readable form content');
    });
});
