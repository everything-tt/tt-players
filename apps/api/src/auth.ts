import type { FastifyReply, FastifyRequest } from 'fastify';

export interface AuthenticatedUser {
    id: string;
    email: string | null;
}

interface SupabaseUserResponse {
    id?: unknown;
    email?: unknown;
}

export async function requireSupabaseUser(
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<AuthenticatedUser | null> {
    const authorization = request.headers.authorization;
    const token = authorization?.startsWith('Bearer ')
        ? authorization.slice('Bearer '.length).trim()
        : '';

    if (!token) {
        await reply.status(401).send({ error: 'Authentication required', statusCode: 401 });
        return null;
    }

    const supabaseUrl = process.env['SUPABASE_URL']?.replace(/\/$/, '');
    const publishableKey = process.env['SUPABASE_PUBLISHABLE_KEY'];
    if (!supabaseUrl || !publishableKey) {
        request.log.error(
            { method: request.method, url: request.url, reqId: request.id },
            'supabase auth env not configured',
        );
        await reply.status(503).send({ error: 'Authentication is not configured', statusCode: 503 });
        return null;
    }

    let response: Response;
    try {
        response = await fetch(`${supabaseUrl}/auth/v1/user`, {
            headers: {
                apikey: publishableKey,
                Authorization: `Bearer ${token}`,
            },
            signal: AbortSignal.timeout(8_000),
        });
    } catch (error) {
        request.log.error(
            { err: error, method: request.method, url: request.url, reqId: request.id },
            'supabase auth request failed',
        );
        await reply.status(503).send({ error: 'Authentication service unavailable', statusCode: 503 });
        return null;
    }

    if (!response.ok) {
        request.log.info(
            { upstreamStatus: response.status, method: request.method, url: request.url, reqId: request.id },
            'supabase rejected session',
        );
        await reply.status(401).send({ error: 'Invalid or expired session', statusCode: 401 });
        return null;
    }

    const payload = await response.json() as SupabaseUserResponse;
    if (typeof payload.id !== 'string' || payload.id.length === 0) {
        request.log.warn(
            { method: request.method, url: request.url, reqId: request.id },
            'supabase returned invalid session user',
        );
        await reply.status(401).send({ error: 'Invalid session user', statusCode: 401 });
        return null;
    }

    return {
        id: payload.id,
        email: typeof payload.email === 'string' ? payload.email : null,
    };
}
