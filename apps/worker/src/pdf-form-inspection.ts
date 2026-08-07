import { PDFParse } from 'pdf-parse';

export class PdfFormInspectionError extends Error {
    readonly statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'PdfFormInspectionError';
        this.statusCode = statusCode;
    }
}

export interface PdfFormInspection {
    provider: 'pdf_document';
    form_url: string;
    title: string | null;
    text: string;
    page_count: number;
}

export type PdfTextParser = (buffer: Buffer) => Promise<{ text: string; total: number }>;

const MAX_PDF_BYTES = 10 * 1024 * 1024;
const MAX_PDF_TEXT_CHARS = 60_000;
const FETCH_TIMEOUT_MS = 20_000;

export function isPdfFormUrl(input: string | null | undefined): boolean {
    if (!input) return false;
    try {
        const url = new URL(input.trim());
        return url.protocol === 'https:' && /\.pdf(?:[?#]|$)/i.test(url.pathname);
    } catch {
        return false;
    }
}

function firstMeaningfulLine(text: string): string | null {
    const line = text
        .split(/\n+/)
        .map((part) => part.trim())
        .find((part) => part.length >= 3);
    return line ? line.slice(0, 200) : null;
}

export async function inspectPdfForm(
    input: string,
    fetcher: typeof fetch = fetch,
    parser: PdfTextParser = async (buffer) => {
        const result = await new PDFParse({ data: buffer }).getText();
        return { text: result.text, total: result.total };
    },
): Promise<PdfFormInspection> {
    let url: URL;
    try {
        url = new URL(input.trim());
    } catch {
        throw new PdfFormInspectionError('Enter a valid PDF URL.', 400);
    }
    if (url.protocol !== 'https:') {
        throw new PdfFormInspectionError('Only HTTPS PDF links are supported.', 400);
    }
    if (!isPdfFormUrl(input)) {
        throw new PdfFormInspectionError('Only PDF entry forms are supported.', 400);
    }

    const response = await fetcher(url, {
        method: 'GET',
        redirect: 'follow',
        headers: {
            Accept: 'application/pdf,*/*',
            'User-Agent': 'TT-Players-Form-Inspector/1.0',
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) {
        throw new PdfFormInspectionError(
            response.status === 401 || response.status === 403
                ? 'This PDF requires access and cannot be inspected.'
                : 'The PDF could not be downloaded.',
            response.status === 401 || response.status === 403 ? 422 : 502,
        );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/pdf') && !/\.pdf(?:[?#]|$)/i.test(url.pathname)) {
        throw new PdfFormInspectionError('The link did not return a PDF document.', 422);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length > MAX_PDF_BYTES) {
        throw new PdfFormInspectionError('The PDF is too large to inspect.', 413);
    }
    if (buffer.length < 5 || buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
        throw new PdfFormInspectionError('The link did not return a valid PDF document.', 422);
    }

    let parsed: { text: string; total: number };
    try {
        parsed = await parser(buffer);
    } catch {
        throw new PdfFormInspectionError('The PDF could not be parsed.', 422);
    }
    const text = (parsed.text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_PDF_TEXT_CHARS);
    if (!text) {
        throw new PdfFormInspectionError('No extractable text was found in this PDF.', 422);
    }

    return {
        provider: 'pdf_document',
        form_url: url.toString(),
        title: firstMeaningfulLine(parsed.text),
        text,
        page_count: parsed.total,
    };
}
