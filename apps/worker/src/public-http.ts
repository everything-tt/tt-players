import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export class PublicHttpError extends Error {
    readonly code: 'invalid_url' | 'blocked_address' | 'too_many_redirects' | 'response_too_large';

    constructor(
        message: string,
        code: PublicHttpError['code'],
    ) {
        super(message);
        this.name = 'PublicHttpError';
        this.code = code;
    }
}

function isPrivateIpv4(address: string): boolean {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return true;
    const [a, b] = parts;
    return a === 0
        || a === 10
        || a === 127
        || (a === 100 && b >= 64 && b <= 127)
        || (a === 169 && b === 254)
        || (a === 172 && b >= 16 && b <= 31)
        || (a === 192 && b === 0)
        || (a === 192 && b === 168)
        || (a === 198 && (b === 18 || b === 19))
        || a >= 224;
}

function isPrivateIpv6(address: string): boolean {
    const normalized = address.toLowerCase();
    if (normalized === '::' || normalized === '::1') return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
    if (/^fe[89ab]/.test(normalized)) return true;
    if (normalized.startsWith('ff')) return true;
    if (normalized.startsWith('2001:db8:')) return true;
    if (normalized.startsWith('::ffff:')) {
        const mapped = normalized.slice('::ffff:'.length);
        return isIP(mapped) === 4 ? isPrivateIpv4(mapped) : true;
    }
    return false;
}

function isBlockedIpAddress(address: string): boolean {
    const family = isIP(address);
    if (family === 4) return isPrivateIpv4(address);
    if (family === 6) return isPrivateIpv6(address);
    return true;
}

export async function assertPublicHttpsUrl(url: URL): Promise<void> {
    if (url.protocol !== 'https:' || url.username || url.password) {
        throw new PublicHttpError('Only public HTTPS URLs without embedded credentials are supported.', 'invalid_url');
    }

    const hostname = url.hostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (!hostname || hostname === 'localhost' || hostname.endsWith('.localhost')) {
        throw new PublicHttpError('The URL points to a local or private address.', 'blocked_address');
    }

    if (isIP(hostname)) {
        if (isBlockedIpAddress(hostname)) {
            throw new PublicHttpError('The URL points to a local or private address.', 'blocked_address');
        }
        return;
    }

    let addresses: Awaited<ReturnType<typeof lookup>>;
    try {
        addresses = await lookup(hostname, { all: true, verbatim: true });
    } catch {
        throw new PublicHttpError('The form host could not be resolved.', 'invalid_url');
    }

    if (addresses.length === 0 || addresses.some(({ address }) => isBlockedIpAddress(address))) {
        throw new PublicHttpError('The URL resolves to a local or private address.', 'blocked_address');
    }
}

export async function fetchPublicHttps(
    input: URL,
    options: {
        fetcher?: typeof fetch;
        headers?: HeadersInit;
        timeoutMs: number;
        maxRedirects?: number;
    },
): Promise<Response> {
    const fetcher = options.fetcher ?? fetch;
    const maxRedirects = options.maxRedirects ?? 4;
    let currentUrl = new URL(input.toString());

    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
        await assertPublicHttpsUrl(currentUrl);
        const response = await fetcher(currentUrl, {
            method: 'GET',
            redirect: 'manual',
            headers: options.headers,
            signal: AbortSignal.timeout(options.timeoutMs),
        });

        if (!REDIRECT_STATUSES.has(response.status)) return response;
        const location = response.headers.get('location');
        if (!location) return response;
        if (redirectCount === maxRedirects) {
            throw new PublicHttpError('The form URL redirected too many times.', 'too_many_redirects');
        }
        currentUrl = new URL(location, currentUrl);
    }

    throw new PublicHttpError('The form URL redirected too many times.', 'too_many_redirects');
}

export async function readBodyLimited(response: Response, maximumBytes: number): Promise<Buffer> {
    const rawLength = response.headers.get('content-length');
    if (rawLength) {
        const declaredLength = Number(rawLength);
        if (Number.isFinite(declaredLength) && declaredLength > maximumBytes) {
            throw new PublicHttpError('The response is too large to inspect.', 'response_too_large');
        }
    }

    if (!response.body) return Buffer.alloc(0);

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            if (!value) continue;
            totalBytes += value.byteLength;
            if (totalBytes > maximumBytes) {
                await reader.cancel();
                throw new PublicHttpError('The response is too large to inspect.', 'response_too_large');
            }
            chunks.push(value);
        }
    } finally {
        reader.releaseLock();
    }

    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)), totalBytes);
}
