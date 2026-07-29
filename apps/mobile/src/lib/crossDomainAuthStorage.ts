/**
 * Cross-domain Supabase auth storage for *.tourneypilot.com.
 *
 * Stores the Supabase session in cookies scoped to `.tourneypilot.com` so a
 * login on any tourneypilot.com subdomain is automatically visible on every
 * other subdomain — single sign-on across the TourneyPilot family of apps
 * (TourneyPilot, TT Learning Library, TT Players).
 *
 * On non-tourneypilot.com hosts (e.g. localhost during development) cookies are
 * written host-only, so each local app still persists its own session.
 *
 * Cookies are chunked to stay under the 4KB per-cookie browser limit. They are
 * Secure + SameSite=Lax and JS-readable (not HttpOnly) — the same exposure model
 * as the default localStorage session used by @supabase/supabase-js.
 */

const SHARED_DOMAIN = '.tourneypilot.com';
const CHUNK_SIZE = 3000; // raw chars per cookie; URL-encoded stays < 4KB
const SESSION_MAX_AGE = 60 * 60 * 24 * 60; // 60 days; supabase-js rewrites on token rotation

function isTourneypilotHost(): boolean {
    if (typeof window === 'undefined') return false;
    const h = window.location.hostname;
    return h === 'tourneypilot.com' || h.endsWith('.tourneypilot.com');
}

function cookieDomain(): string | undefined {
    return isTourneypilotHost() ? SHARED_DOMAIN : undefined;
}

function readCookieMap(): Record<string, string> {
    const map: Record<string, string> = {};
    if (typeof document === 'undefined' || !document.cookie) return map;
    for (const part of document.cookie.split(';')) {
        const trimmed = part.trim();
        if (!trimmed) continue;
        const eq = trimmed.indexOf('=');
        if (eq === -1) continue;
        const k = trimmed.slice(0, eq);
        try {
            map[k] = decodeURIComponent(trimmed.slice(eq + 1));
        } catch {
            map[k] = trimmed.slice(eq + 1);
        }
    }
    return map;
}

function writeCookie(name: string, value: string): void {
    if (typeof document === 'undefined') return;
    const parts = [
        `${name}=${encodeURIComponent(value)}`,
        'Path=/',
        'SameSite=Lax',
        'Secure',
        `Max-Age=${SESSION_MAX_AGE}`,
    ];
    const domain = cookieDomain();
    if (domain) parts.push(`Domain=${domain}`);
    document.cookie = parts.join('; ');
}

function clearCookie(name: string): void {
    if (typeof document === 'undefined') return;
    const parts = [`${name}=`, 'Path=/', 'SameSite=Lax', 'Secure', 'Max-Age=0'];
    const domain = cookieDomain();
    if (domain) parts.push(`Domain=${domain}`);
    document.cookie = parts.join('; ');
}

function getItem(key: string): string | null {
    const map = readCookieMap();
    if (map[key] !== undefined) return map[key];
    // Chunked form: key.0, key.1, ...
    const chunks: string[] = [];
    let i = 0;
    while (map[`${key}.${i}`] !== undefined) {
        chunks.push(map[`${key}.${i}`]);
        i++;
    }
    return chunks.length > 0 ? chunks.join('') : null;
}

function setItem(key: string, value: string): void {
    removeItem(key);
    if (value.length <= CHUNK_SIZE) {
        writeCookie(key, value);
        return;
    }
    let i = 0;
    for (let pos = 0; pos < value.length; pos += CHUNK_SIZE, i++) {
        writeCookie(`${key}.${i}`, value.slice(pos, pos + CHUNK_SIZE));
    }
}

function removeItem(key: string): void {
    clearCookie(key);
    const map = readCookieMap();
    let i = 0;
    while (map[`${key}.${i}`] !== undefined) {
        clearCookie(`${key}.${i}`);
        i++;
    }
}

export const crossDomainAuthStorage = { getItem, setItem, removeItem };