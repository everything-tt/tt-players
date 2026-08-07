import { describe, expect, it, vi } from 'vitest';
import {
    inspectPdfForm,
    isPdfFormUrl,
    PdfFormInspectionError,
} from '../pdf-form-inspection.js';

describe('PDF entry form inspection', () => {
    it('recognises PDF form URLs', () => {
        expect(isPdfFormUrl('https://example.com/entry-form.pdf')).toBe(true);
        expect(isPdfFormUrl('https://example.com/entry-form.pdf?download=1')).toBe(true);
        expect(isPdfFormUrl('https://example.com/entry-form')).toBe(false);
        expect(isPdfFormUrl('https://docs.google.com/forms/d/e/example/viewform')).toBe(false);
        expect(isPdfFormUrl(null)).toBe(false);
    });

    it('downloads, parses and normalises a PDF document', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response(
            new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1, 2, 3]),
            { status: 200, headers: { 'Content-Type': 'application/pdf' } },
        ));
        const parser = vi.fn(async () => ({
            text: 'Nottingham Veterans 2*\nCLOSING DATE FOR ENTRIES: Friday 14th August 2026\nVenue: Nottingham TTC',
            total: 4,
        }));

        const inspection = await inspectPdfForm('https://example.com/entry-form.pdf', fetcher, parser);

        expect(inspection).toEqual({
            provider: 'pdf_document',
            form_url: 'https://example.com/entry-form.pdf',
            title: 'Nottingham Veterans 2*',
            text: 'Nottingham Veterans 2* CLOSING DATE FOR ENTRIES: Friday 14th August 2026 Venue: Nottingham TTC',
            page_count: 4,
        });
        expect(fetcher).toHaveBeenCalledOnce();
    });

    it('rejects responses that are not PDF documents', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response('not a pdf', {
            status: 200,
            headers: { 'Content-Type': 'text/html' },
        }));
        await expect(inspectPdfForm('https://example.com/entry-form.pdf', fetcher))
            .rejects.toThrow(PdfFormInspectionError);
    });

    it('rejects PDFs without extractable text', async () => {
        const fetcher = vi.fn<typeof fetch>(async () => new Response(
            new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1]),
            { status: 200, headers: { 'Content-Type': 'application/pdf' } },
        ));
        const parser = vi.fn(async () => ({ text: '   ', total: 1 }));
        await expect(inspectPdfForm('https://example.com/entry-form.pdf', fetcher, parser))
            .rejects.toThrow('No extractable text');
    });
});
